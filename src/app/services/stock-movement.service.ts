/**
 * StockMovementService — centralized gateway for all inventory mutations.
 *
 * Follows the PricingService pattern: exported as an object with static methods.
 * Every place in the system that records a stock movement or adjusts asset
 * quantities calls this service. No other module directly INSERTs into
 * stock_movements or UPDATEs asset quantities for stock reasons.
 *
 * Movement types:
 *   OUTBOUND  — items leaving warehouse (scan out). Audit only.
 *   INBOUND   — items returning to warehouse (scan in). Audit only.
 *   WRITE_OFF — items permanently gone (consumed, lost, damaged). Decrements total_quantity.
 *   ADJUSTMENT — manual admin correction. Adjusts both total + available.
 *   INITIAL   — recorded at asset creation. Audit only.
 *
 * "Audit only" means the movement is recorded in the ledger but does NOT
 * change asset quantities — those are managed by the booking lifecycle
 * (reserve on order creation, net-restore on order close).
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import {
    assets,
    assetFamilies,
    stockMovements,
    users,
} from "../../db/schema";
import { eventBus, EVENT_TYPES } from "../events";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MovementType = "OUTBOUND" | "INBOUND" | "WRITE_OFF" | "ADJUSTMENT" | "INITIAL";
export type WriteOffReason = "CONSUMED" | "LOST" | "DAMAGED" | "OTHER";

export interface RecordMovementParams {
    platformId: string;
    assetId: string;
    familyId?: string | null;
    delta: number;
    movementType: MovementType;
    writeOffReason?: WriteOffReason | null;
    note?: string | null;
    linkedEntityType?: string | null; // "ORDER", "SELF_PICKUP"
    linkedEntityId?: string | null;
    scanEventId?: string | null;
    userId: string;
}

// Movement types that cause real quantity changes on assets
const TOTAL_QTY_AFFECTING: Set<MovementType> = new Set(["WRITE_OFF", "ADJUSTMENT"]);
const AVAILABLE_QTY_AFFECTING: Set<MovementType> = new Set(["ADJUSTMENT"]);

// ─── Core: record() ────────────────────────────────────────────────────────

async function record(
    executor: any, // db or tx — allows running inside or outside a transaction
    params: RecordMovementParams
): Promise<{ id: string }> {
    // 1. Write the ledger row (always)
    const [movement] = await (executor ?? db)
        .insert(stockMovements)
        .values({
            platform_id: params.platformId,
            asset_id: params.assetId,
            asset_family_id: params.familyId || null,
            delta: params.delta,
            movement_type: params.movementType,
            write_off_reason: params.writeOffReason || null,
            note: params.note || null,
            linked_entity_type: params.linkedEntityType || null,
            linked_entity_id: params.linkedEntityId || null,
            linked_scan_event_id: params.scanEventId || null,
            created_by: params.userId,
        })
        .returning({ id: stockMovements.id });

    // 2. Apply quantity changes based on movement type
    const ex = executor ?? db;

    if (TOTAL_QTY_AFFECTING.has(params.movementType)) {
        const updates: Record<string, any> = {
            total_quantity: sql`GREATEST(0, ${assets.total_quantity} + ${params.delta})`,
        };

        if (AVAILABLE_QTY_AFFECTING.has(params.movementType)) {
            updates.available_quantity = sql`GREATEST(0, ${assets.available_quantity} + ${params.delta})`;
        }

        await ex
            .update(assets)
            .set(updates)
            .where(eq(assets.id, params.assetId));
    }

    // 3. Check threshold crossing (for quantity-affecting movements)
    if (TOTAL_QTY_AFFECTING.has(params.movementType)) {
        await checkThresholdCrossing(params.platformId, params.assetId, params.userId);
    }

    return movement;
}

// ─── Threshold ──────────────────────────────────────────────────────────────

async function checkThresholdCrossing(
    platformId: string,
    assetId: string,
    userId: string
): Promise<void> {
    const asset = await db.query.assets.findFirst({
        where: eq(assets.id, assetId),
        columns: { id: true, name: true, family_id: true, company_id: true, available_quantity: true },
    });

    if (!asset?.family_id) return;

    const family = await db.query.assetFamilies.findFirst({
        where: eq(assetFamilies.id, asset.family_id),
        columns: { id: true, name: true, low_stock_threshold: true },
    });

    if (!family?.low_stock_threshold) return;

    // Aggregate available across all assets in the family
    const [agg] = await db
        .select({
            total_available: sql<number>`COALESCE(SUM(${assets.available_quantity}), 0)`,
        })
        .from(assets)
        .where(and(eq(assets.family_id, family.id), sql`${assets.deleted_at} IS NULL`));

    const totalAvailable = Number(agg?.total_available || 0);

    if (totalAvailable < family.low_stock_threshold) {
        await eventBus.emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.STOCK_BELOW_THRESHOLD,
            entity_type: "ASSET",
            entity_id: assetId,
            actor_id: userId,
            actor_role: "SYSTEM",
            payload: {
                entity_id_readable: asset.name,
                company_id: asset.company_id,
                company_name: "",
                asset_name: asset.name,
                family_name: family.name,
                available_quantity: totalAvailable,
                low_stock_threshold: family.low_stock_threshold,
            },
        });
    }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

async function getAssetHistory(
    assetId: string,
    platformId: string,
    params: { page?: number; limit?: number } = {}
) {
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
        .where(and(eq(stockMovements.asset_id, assetId), eq(stockMovements.platform_id, platformId)))
        .orderBy(desc(stockMovements.created_at))
        .limit(limit)
        .offset(offset);

    return { movements, page, limit };
}

async function getFamilyHistory(
    familyId: string,
    platformId: string,
    params: { page?: number; limit?: number } = {}
) {
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
        .leftJoin(users, eq(stockMovements.created_by, users.id))
        .leftJoin(assets, eq(stockMovements.asset_id, assets.id))
        .where(
            and(eq(stockMovements.asset_family_id, familyId), eq(stockMovements.platform_id, platformId))
        )
        .orderBy(desc(stockMovements.created_at))
        .limit(limit)
        .offset(offset);

    return { movements, page, limit };
}

async function getLowStockFamilies(platformId: string, companyId?: string) {
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
        .leftJoin(assets, and(eq(assets.family_id, assetFamilies.id), sql`${assets.deleted_at} IS NULL`))
        .where(and(...conditions))
        .groupBy(assetFamilies.id)
        .having(sql`COALESCE(SUM(${assets.available_quantity}), 0) < ${assetFamilies.low_stock_threshold}`);

    return families.map((f) => ({
        ...f,
        total_available: Number(f.total_available),
        total_quantity: Number(f.total_quantity),
        low_stock_threshold: Number(f.low_stock_threshold),
    }));
}

// ─── Export ─────────────────────────────────────────────────────────────────

export const StockMovementService = {
    record,
    getAssetHistory,
    getFamilyHistory,
    getLowStockFamilies,
};
