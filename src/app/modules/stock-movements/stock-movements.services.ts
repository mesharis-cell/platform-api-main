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
// eventBus no longer needed here — threshold check moved to StockMovementService

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
            movement_type: stockMovements.movement_type,
            write_off_reason: stockMovements.write_off_reason,
            note: stockMovements.note,
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
            movement_type: stockMovements.movement_type,
            write_off_reason: stockMovements.write_off_reason,
            note: stockMovements.note,
            linked_entity_type: stockMovements.linked_entity_type,
            linked_entity_id: stockMovements.linked_entity_id,
            created_by_name: users.name,
            created_at: stockMovements.created_at,
        })
        .from(stockMovements)
        .innerJoin(assets, eq(stockMovements.asset_id, assets.id))
        .leftJoin(users, eq(stockMovements.created_by, users.id))
        .where(
            and(
                eq(assets.family_id, familyId),
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

    // Delegate to StockMovementService — handles ledger write, qty adjustment, threshold check
    const { StockMovementService } = await import("../../services/stock-movement.service");
    const movement = await StockMovementService.record(null, {
        platformId,
        assetId: asset_id,
        delta,
        movementType: "ADJUSTMENT",
        note: reason_note,
        userId: user.id,
    });

    const updatedAsset = await db.query.assets.findFirst({
        where: eq(assets.id, asset_id),
        columns: { available_quantity: true },
    });

    return {
        movement_id: movement.id,
        asset_id,
        delta,
        new_available_quantity: updatedAsset?.available_quantity ?? 0,
    };
};

export const StockMovementsServices = {
    getAssetStockHistory,
    getFamilyStockHistory,
    getLowStockFamilies,
    createManualAdjustment,
};
