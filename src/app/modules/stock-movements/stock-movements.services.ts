import { and, desc, eq, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assets,
    assetFamilies,
    stockMovements,
    users,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eventBus } from "../../events";

// ----------------------------------- GET ASSET STOCK HISTORY ------------------------------

const getAssetStockHistory = async (
    assetId: string,
    platformId: string,
    params: { page?: number; limit?: number }
) => {
    const { page = 1, limit = 50 } = params;
    const offset = (page - 1) * limit;

    const movements = await db
        .select({
            id: stockMovements.id,
            delta: stockMovements.delta,
            reason: stockMovements.reason,
            reason_note: stockMovements.reason_note,
            linked_entity_type: stockMovements.linked_entity_type,
            linked_entity_id: stockMovements.linked_entity_id,
            created_by_name: users.name,
            created_at: stockMovements.created_at,
        })
        .from(stockMovements)
        .leftJoin(users, eq(stockMovements.created_by, users.id))
        .where(
            and(eq(stockMovements.asset_id, assetId), eq(stockMovements.platform_id, platformId))
        )
        .orderBy(desc(stockMovements.created_at))
        .limit(limit)
        .offset(offset);

    return { movements, page, limit };
};

// ----------------------------------- GET FAMILY STOCK HISTORY ----------------------------

const getFamilyStockHistory = async (
    familyId: string,
    platformId: string,
    params: { page?: number; limit?: number }
) => {
    const { page = 1, limit = 50 } = params;
    const offset = (page - 1) * limit;

    const movements = await db
        .select({
            id: stockMovements.id,
            asset_id: stockMovements.asset_id,
            asset_name: assets.name,
            delta: stockMovements.delta,
            reason: stockMovements.reason,
            reason_note: stockMovements.reason_note,
            linked_entity_type: stockMovements.linked_entity_type,
            linked_entity_id: stockMovements.linked_entity_id,
            created_by_name: users.name,
            created_at: stockMovements.created_at,
        })
        .from(stockMovements)
        .leftJoin(users, eq(stockMovements.created_by, users.id))
        .leftJoin(assets, eq(stockMovements.asset_id, assets.id))
        .where(
            and(
                eq(stockMovements.asset_family_id, familyId),
                eq(stockMovements.platform_id, platformId)
            )
        )
        .orderBy(desc(stockMovements.created_at))
        .limit(limit)
        .offset(offset);

    return { movements, page, limit };
};

// ----------------------------------- LOW STOCK FAMILIES ----------------------------------

const getLowStockFamilies = async (platformId: string, companyId?: string) => {
    // Aggregate available_quantity per family and compare against threshold
    const conditions = [
        eq(assetFamilies.platform_id, platformId),
        sql`${assetFamilies.low_stock_threshold} IS NOT NULL`,
        sql`${assetFamilies.deleted_at} IS NULL`,
    ];
    if (companyId) conditions.push(eq(assetFamilies.company_id, companyId));

    const families = await db
        .select({
            family_id: assetFamilies.id,
            family_name: assetFamilies.name,
            company_id: assetFamilies.company_id,
            stock_mode: assetFamilies.stock_mode,
            low_stock_threshold: assetFamilies.low_stock_threshold,
            total_available: sql<number>`COALESCE(SUM(${assets.available_quantity}), 0)`,
            total_quantity: sql<number>`COALESCE(SUM(${assets.total_quantity}), 0)`,
        })
        .from(assetFamilies)
        .leftJoin(
            assets,
            and(eq(assets.family_id, assetFamilies.id), sql`${assets.deleted_at} IS NULL`)
        )
        .where(and(...conditions))
        .groupBy(assetFamilies.id)
        .having(
            sql`COALESCE(SUM(${assets.available_quantity}), 0) < ${assetFamilies.low_stock_threshold}`
        );

    return families.map((f) => ({
        ...f,
        total_available: Number(f.total_available),
        total_quantity: Number(f.total_quantity),
        low_stock_threshold: Number(f.low_stock_threshold),
        is_below_threshold: Number(f.total_available) < Number(f.low_stock_threshold),
    }));
};

// ----------------------------------- MANUAL ADJUSTMENT -----------------------------------

const createManualAdjustment = async (
    platformId: string,
    user: AuthUser,
    payload: {
        asset_id: string;
        delta: number;
        reason_note: string;
    }
) => {
    const { asset_id, delta, reason_note } = payload;

    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.id, asset_id), eq(assets.platform_id, platformId)),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Create stock movement record
    const [movement] = await db
        .insert(stockMovements)
        .values({
            platform_id: platformId,
            asset_id,
            asset_family_id: asset.family_id,
            delta,
            reason: "MANUAL_ADJUSTMENT",
            reason_note,
            created_by: user.id,
        })
        .returning();

    // Update the asset's available_quantity
    const newAvailable = Math.max(0, asset.available_quantity + delta);
    await db
        .update(assets)
        .set({ available_quantity: newAvailable })
        .where(eq(assets.id, asset_id));

    // If delta is negative, update total_quantity too
    if (delta < 0) {
        const newTotal = Math.max(0, asset.total_quantity + delta);
        await db
            .update(assets)
            .set({ total_quantity: newTotal })
            .where(eq(assets.id, asset_id));
    }

    // Check low-stock threshold after adjustment
    if (asset.family_id) {
        const family = await db.query.assetFamilies.findFirst({
            where: eq(assetFamilies.id, asset.family_id),
        });

        if (
            family?.low_stock_threshold &&
            newAvailable < family.low_stock_threshold
        ) {
            await eventBus.emit({
                platform_id: platformId,
                event_type: "stock.below_threshold",
                entity_type: "SELF_PICKUP", // Using SELF_PICKUP as closest entity type for stock events
                entity_id: asset_id,
                actor_id: user.id,
                actor_role: user.role,
                payload: {
                    entity_id_readable: asset.name,
                    company_id: asset.company_id,
                    company_name: "",
                    asset_name: asset.name,
                    family_name: family.name,
                    available_quantity: newAvailable,
                    low_stock_threshold: family.low_stock_threshold,
                },
            });
        }
    }

    return {
        movement_id: movement.id,
        asset_id,
        delta,
        new_available_quantity: newAvailable,
    };
};

export const StockMovementsServices = {
    getAssetStockHistory,
    getFamilyStockHistory,
    getLowStockFamilies,
    createManualAdjustment,
};
