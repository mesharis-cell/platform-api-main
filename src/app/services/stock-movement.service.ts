/**
 * StockMovementService — centralized gateway for all inventory mutations.
 *
 * Follows the PricingService pattern: exported as an object with static methods.
 * Every place in the system that records a stock movement or adjusts asset
 * quantities calls this service. No other module directly INSERTs into
 * stock_movements or UPDATEs asset quantities for stock reasons.
 *
 * Movement types:
 *   OUTBOUND        — items leaving warehouse (scan out). Audit only.
 *   INBOUND         — items returning to warehouse (scan in). Audit only.
 *   WRITE_OFF       — settlement: a booked unit didn't fully return. Decrements
 *                     total_quantity only (the booking already accounted for
 *                     available). Fired by the inbound-scan settlement flow.
 *   OUTBOUND_AD_HOC — operator removed a unit from the warehouse outside the
 *                     booking lifecycle (replacement, install consumption,
 *                     repurposing). Decrements BOTH total_quantity AND
 *                     available_quantity — the unit was sitting freely on the
 *                     shelf, both counters need to drop. See gotcha #44.
 *   ADJUSTMENT      — manual count correction. Decrements both.
 *   INITIAL         — recorded at asset creation. Audit only.
 *
 * "Audit only" means the movement is recorded in the ledger but does NOT
 * change asset quantities — those are managed by the booking lifecycle
 * (reserve on order creation, net-restore on order close).
 */

import { and, desc, eq, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import { assets, stockMovements, users } from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { eventBus, EVENT_TYPES } from "../events";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MovementType =
    | "OUTBOUND"
    | "INBOUND"
    | "WRITE_OFF"
    | "ADJUSTMENT"
    | "INITIAL"
    | "OUTBOUND_AD_HOC";
export type WriteOffReason = "CONSUMED" | "LOST" | "DAMAGED" | "OTHER";
export type OutboundAdHocReason = "REPLACEMENT" | "INSTALL_CONSUMPTION" | "REPURPOSED" | "OTHER";

export interface RecordMovementParams {
    platformId: string;
    assetId: string;
    delta: number;
    movementType: MovementType;
    writeOffReason?: WriteOffReason | null;
    outboundAdHocReason?: OutboundAdHocReason | null;
    note?: string | null;
    linkedEntityType?: string | null; // "ORDER", "SELF_PICKUP"
    linkedEntityId?: string | null;
    scanEventId?: string | null;
    userId: string;
}

// Movement types that cause real quantity changes on assets.
// OUTBOUND_AD_HOC matches ADJUSTMENT semantics: decrements both because the
// unit was sitting in available before the operator walked off with it.
const TOTAL_QTY_AFFECTING: Set<MovementType> = new Set([
    "WRITE_OFF",
    "ADJUSTMENT",
    "OUTBOUND_AD_HOC",
]);
const AVAILABLE_QTY_AFFECTING: Set<MovementType> = new Set(["ADJUSTMENT", "OUTBOUND_AD_HOC"]);

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
            asset_family_id: null,
            delta: params.delta,
            movement_type: params.movementType,
            write_off_reason: params.writeOffReason || null,
            outbound_ad_hoc_reason: params.outboundAdHocReason || null,
            note: params.note || null,
            linked_entity_type: params.linkedEntityType || null,
            linked_entity_id: params.linkedEntityId || null,
            linked_scan_event_id: params.scanEventId || null,
            created_by: params.userId,
        })
        .returning({ id: stockMovements.id });

    // 2. Apply quantity changes based on movement type.
    // The UPDATE may trip the assets_available_le_total CHECK constraint
    // (added in migration 0053) if a code path produces an impossible state.
    // Translate the raw PG error 23514 into a friendly CustomizedError so the
    // FE sees an actionable 400 instead of a generic 500.
    const ex = executor ?? db;

    if (TOTAL_QTY_AFFECTING.has(params.movementType)) {
        const updates: Record<string, any> = {
            total_quantity: sql`GREATEST(0, ${assets.total_quantity} + ${params.delta})`,
        };

        if (AVAILABLE_QTY_AFFECTING.has(params.movementType)) {
            updates.available_quantity = sql`GREATEST(0, ${assets.available_quantity} + ${params.delta})`;
        }

        try {
            await ex.update(assets).set(updates).where(eq(assets.id, params.assetId));
        } catch (err: any) {
            // PG error code 23514 = check_violation
            if (err?.code === "23514" || err?.cause?.code === "23514") {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "This adjustment would put inventory in an impossible state (available > total). For ad-hoc removal use Stock Out + Correction or Stock Out + Used for an order/pickup."
                );
            }
            throw err;
        }
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
    // Per-asset threshold post-squash (no aggregation across siblings).
    // Threshold is opt-in (NULL means no alert). Meaningful primarily for POOLED
    // assets where available_quantity is a pool counter; for SERIALIZED assets
    // the threshold field exists but is usually NULL.
    const asset = await db.query.assets.findFirst({
        where: eq(assets.id, assetId),
        columns: {
            id: true,
            name: true,
            group_name: true,
            company_id: true,
            available_quantity: true,
            low_stock_threshold: true,
        },
    });

    if (!asset?.low_stock_threshold) return;

    const available = Number(asset.available_quantity);
    if (available < asset.low_stock_threshold) {
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
                group_name: asset.group_name ?? null,
                available_quantity: available,
                low_stock_threshold: asset.low_stock_threshold,
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
            outbound_ad_hoc_reason: stockMovements.outbound_ad_hoc_reason,
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
}

// NOTE: getFamilyHistory was DELETED in the squash. No group-aggregated stock
// history endpoint exists post-cutover; per-asset history (getAssetHistory) is
// the only one. See locked decision #10.

async function getLowStockAssets(platformId: string, companyId?: string) {
    // Per-asset low-stock surface (replaces getLowStockFamilies). Returns rows
    // where available_quantity is below the per-asset threshold. Naturally
    // surfaces POOLED assets (which carry the meaningful thresholds); SERIALIZED
    // rows typically have NULL thresholds and are excluded.
    const conditions = [
        eq(assets.platform_id, platformId),
        sql`${assets.low_stock_threshold} IS NOT NULL`,
        sql`${assets.deleted_at} IS NULL`,
        sql`${assets.available_quantity} < ${assets.low_stock_threshold}`,
    ];
    if (companyId) conditions.push(eq(assets.company_id, companyId));

    const rows = await db
        .select({
            asset_id: assets.id,
            asset_name: assets.name,
            group_id: assets.group_id,
            group_name: assets.group_name,
            company_id: assets.company_id,
            stock_mode: assets.stock_mode,
            low_stock_threshold: assets.low_stock_threshold,
            available_quantity: assets.available_quantity,
            total_quantity: assets.total_quantity,
        })
        .from(assets)
        .where(and(...conditions));

    return rows.map((r) => ({
        ...r,
        available_quantity: Number(r.available_quantity),
        total_quantity: Number(r.total_quantity),
        low_stock_threshold: Number(r.low_stock_threshold),
    }));
}

// ─── Export ─────────────────────────────────────────────────────────────────

export const StockMovementService = {
    record,
    getAssetHistory,
    getLowStockAssets,
};
