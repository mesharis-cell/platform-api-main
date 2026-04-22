/**
 * Shared availability primitives — single source of truth for "can this asset
 * serve this quantity in this window?"
 *
 * Replaces the ad-hoc `assets.status !== 'AVAILABLE'` gates that were scattered
 * across order submit, self-pickup submit, client checkout, and mid-flow item
 * adds. Those gates misbehaved for pooled assets (a pool with some qty out
 * would flip `status=OUT` and block the whole pool even when thousands of
 * units were still available).
 *
 * The new model: availability is derived from `asset_bookings` overlap math
 * plus optional `self_booking_items` OUT accounting, not from a snapshot
 * column. `assets.status` is demoted to a UI/scanner hint + MAINTENANCE
 * (serialized) and TRANSFORMED hard-blocks.
 *
 * Overlap math uses the correct formula: `booking.start <= window.end AND
 * booking.end >= window.start`. The legacy `checkAssetsForOrder` query at
 * order.utils.ts used `booking.start <= window.start AND booking.end >=
 * window.end` which only caught bookings that ENVELOPED the event window,
 * silently missing partial overlaps. That bug is fixed by construction here.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../db";
import { assets, assetBookings, selfBookingItems } from "../../../db/schema";

export type AvailabilityWindow = { start: Date; end: Date };

export type AvailabilityRequest = {
    asset_id: string;
    quantity?: number;
};

export type AvailabilityReasonCode =
    | "NOT_FOUND"
    | "SOFT_DELETED"
    | "TRANSFORMED"
    | "MAINTENANCE"
    | "INSUFFICIENT_QUANTITY";

export type AvailabilityConflict = {
    order_id: string | null;
    self_pickup_id: string | null;
    quantity: number;
    blocked_from: Date;
    blocked_until: Date;
};

export type AvailabilityResult = {
    asset_id: string;
    asset_name: string;
    tracking_method: "INDIVIDUAL" | "BATCH";
    total_quantity: number;
    booked_quantity: number;
    self_booked_quantity: number;
    available_quantity: number;
    requested_quantity?: number;
    is_available: boolean;
    reason_code?: AvailabilityReasonCode;
    next_available_date?: string;
    conflicts: AvailabilityConflict[];
};

type MinimalAsset = {
    id: string;
    name: string;
    status: "AVAILABLE" | "BOOKED" | "OUT" | "MAINTENANCE" | "TRANSFORMED";
    tracking_method: "INDIVIDUAL" | "BATCH";
    total_quantity: number;
};

/**
 * Pure: given an asset + its overlapping bookings + self-booked qty + window
 * + optional requested quantity, compute the availability result. No DB.
 *
 * Rules:
 *   - TRANSFORMED always hard-blocks (asset is terminal).
 *   - MAINTENANCE hard-blocks only for INDIVIDUAL (serialized) assets.
 *     For pooled (BATCH), MAINTENANCE on the row is meaningless — the pool
 *     can have some maintenance units while the rest is fine. We defer to
 *     quantity math.
 *   - Otherwise: available_quantity = max(0, total - booked - self_booked).
 *     If a requested quantity was passed and available < requested →
 *     INSUFFICIENT_QUANTITY.
 *   - next_available_date is the latest overlapping booking's blocked_until
 *     + 1 day, surfaced when unavailable so the UI can suggest a later window.
 */
export const computeAvailability = (params: {
    asset: MinimalAsset;
    overlappingBookings: AvailabilityConflict[];
    selfBookedQty: number;
    requestedQty?: number;
}): AvailabilityResult => {
    const { asset, overlappingBookings, selfBookedQty, requestedQty } = params;

    const bookedQuantity = overlappingBookings.reduce((sum, b) => sum + b.quantity, 0);
    const availableQuantity = Math.max(0, asset.total_quantity - bookedQuantity - selfBookedQty);

    const base: AvailabilityResult = {
        asset_id: asset.id,
        asset_name: asset.name,
        tracking_method: asset.tracking_method,
        total_quantity: asset.total_quantity,
        booked_quantity: bookedQuantity,
        self_booked_quantity: selfBookedQty,
        available_quantity: availableQuantity,
        requested_quantity: requestedQty,
        is_available: true,
        conflicts: overlappingBookings,
    };

    const applyNextAvailable = (result: AvailabilityResult): AvailabilityResult => {
        if (overlappingBookings.length === 0) return result;
        const latestEnd = overlappingBookings.reduce(
            (max, b) => (b.blocked_until.getTime() > max ? b.blocked_until.getTime() : max),
            0
        );
        const nextDay = new Date(latestEnd);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        return { ...result, next_available_date: nextDay.toISOString().split("T")[0] };
    };

    // Hard-block: TRANSFORMED
    if (asset.status === "TRANSFORMED") {
        return { ...base, is_available: false, reason_code: "TRANSFORMED" };
    }

    // Hard-block: MAINTENANCE on serialized only
    if (asset.status === "MAINTENANCE" && asset.tracking_method === "INDIVIDUAL") {
        return { ...base, is_available: false, reason_code: "MAINTENANCE" };
    }

    // Quantity check
    if (requestedQty !== undefined && availableQuantity < requestedQty) {
        return applyNextAvailable({
            ...base,
            is_available: false,
            reason_code: "INSUFFICIENT_QUANTITY",
        });
    }

    return base;
};

// Matches the existing convention in `order.utils.ts` — Drizzle's transaction
// type doesn't unify cleanly with `typeof db` at the type level, so callers
// pass either the module-level `db` or the `tx` handle from inside a
// `db.transaction(async (tx) => ...)` block.
type TxOrDb = any; // tx | typeof db

/**
 * DB-aware: fetch assets + their overlapping bookings + self-booking OUT
 * quantities for the given window, then compute per-asset availability.
 *
 * Callers:
 *   - `POST /asset/availability` (client cart validation)
 *   - `checkAssetsForOrder` (order submit gate, called inside submit tx)
 *   - `addSelfPickupItemMidflow` (warehouse SP mid-handover add-item gate)
 *
 * Params:
 *   - `tx` — pass the transaction when called inside one; otherwise uses the
 *     default `db` connection.
 *   - `lockForUpdate` — when true, `SELECT ... FOR UPDATE` on the asset rows.
 *     Used inside submit transactions to serialize concurrent submits for the
 *     same asset (prevents oversell under READ COMMITTED).
 *   - `excludeEntity` — for edit flows (admin changes qty on an existing
 *     order), skip the entity's own bookings so they aren't counted as
 *     conflicts against itself.
 *   - `window` — when omitted, use an empty [now, now] window. The core only
 *     considers hard-blocks (TRANSFORMED/MAINTENANCE) and pool baseline
 *     (self-booked OUT); no booking rows will overlap a zero-width window.
 */
export const checkAvailability = async (params: {
    tx?: TxOrDb;
    platformId: string;
    companyId?: string | null;
    requests: AvailabilityRequest[];
    window?: AvailabilityWindow;
    excludeEntity?: { type: "ORDER" | "SELF_PICKUP"; id: string };
    lockForUpdate?: boolean;
}): Promise<Map<string, AvailabilityResult>> => {
    const {
        tx,
        platformId,
        companyId,
        requests,
        window,
        excludeEntity,
        lockForUpdate = false,
    } = params;

    const database = tx ?? db;
    const assetIds = Array.from(new Set(requests.map((r) => r.asset_id)));
    const requestedByAsset = new Map<string, number>();
    for (const r of requests) {
        if (r.quantity !== undefined) {
            requestedByAsset.set(r.asset_id, (requestedByAsset.get(r.asset_id) ?? 0) + r.quantity);
        }
    }

    const result = new Map<string, AvailabilityResult>();

    if (assetIds.length === 0) return result;

    // Step 1: Fetch assets (active only, platform + optional company scoped).
    // FOR UPDATE locks the rows so concurrent submit transactions serialize.
    const assetConditions = [
        inArray(assets.id, assetIds),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];
    if (companyId) {
        assetConditions.push(eq(assets.company_id, companyId));
    }

    const assetQuery = database
        .select({
            id: assets.id,
            name: assets.name,
            status: assets.status,
            tracking_method: assets.tracking_method,
            total_quantity: assets.total_quantity,
        })
        .from(assets)
        .where(and(...assetConditions));

    const foundAssets: MinimalAsset[] = lockForUpdate
        ? await assetQuery.for("update")
        : await assetQuery;
    const foundById = new Map<string, MinimalAsset>(foundAssets.map((a) => [a.id, a] as const));

    // Step 2: Fetch overlapping bookings (window-aware) + self-booking OUT
    // quantities (indefinite reservations). Only needed for assets that
    // were found; missing assets short-circuit with NOT_FOUND below.
    const foundIds = foundAssets.map((a) => a.id);

    const bookingRows =
        foundIds.length === 0 || !window
            ? []
            : await database
                  .select({
                      asset_id: assetBookings.asset_id,
                      order_id: assetBookings.order_id,
                      self_pickup_id: assetBookings.self_pickup_id,
                      quantity: assetBookings.quantity,
                      blocked_from: assetBookings.blocked_from,
                      blocked_until: assetBookings.blocked_until,
                  })
                  .from(assetBookings)
                  .where(
                      and(
                          inArray(assetBookings.asset_id, foundIds),
                          // Correct overlap math: A.start <= B.end AND A.end >= B.start
                          sql`${assetBookings.blocked_from} <= ${window.end}`,
                          sql`${assetBookings.blocked_until} >= ${window.start}`
                      )
                  );

    // Self-bookings are indefinite (no window). Any quantity currently out
    // blocks the pool for every window until returned. The self-bookings
    // feature is currently unused in prod but the code path is live; the
    // core accounts for it so flipping the feature on won't cause oversell.
    const selfBookingRows =
        foundIds.length === 0
            ? []
            : await database
                  .select({
                      asset_id: selfBookingItems.asset_id,
                      out_qty: sql<number>`COALESCE(SUM(${selfBookingItems.quantity} - ${selfBookingItems.returned_quantity}), 0)`,
                  })
                  .from(selfBookingItems)
                  .where(
                      and(
                          inArray(selfBookingItems.asset_id, foundIds),
                          eq(selfBookingItems.status, "OUT")
                      )
                  )
                  .groupBy(selfBookingItems.asset_id);

    // Group bookings by asset, applying excludeEntity filter if present.
    const bookingsByAsset = new Map<string, AvailabilityConflict[]>();
    for (const row of bookingRows) {
        if (excludeEntity) {
            if (excludeEntity.type === "ORDER" && row.order_id === excludeEntity.id) continue;
            if (excludeEntity.type === "SELF_PICKUP" && row.self_pickup_id === excludeEntity.id)
                continue;
        }
        const list = bookingsByAsset.get(row.asset_id) ?? [];
        list.push({
            order_id: row.order_id,
            self_pickup_id: row.self_pickup_id,
            quantity: row.quantity,
            blocked_from: row.blocked_from,
            blocked_until: row.blocked_until,
        });
        bookingsByAsset.set(row.asset_id, list);
    }

    const selfBookedByAsset = new Map<string, number>();
    for (const row of selfBookingRows) {
        selfBookedByAsset.set(row.asset_id, Number(row.out_qty ?? 0));
    }

    // Step 3: Compose per-asset results.
    for (const assetId of assetIds) {
        const asset = foundById.get(assetId);
        if (!asset) {
            result.set(assetId, {
                asset_id: assetId,
                asset_name: "",
                tracking_method: "INDIVIDUAL",
                total_quantity: 0,
                booked_quantity: 0,
                self_booked_quantity: 0,
                available_quantity: 0,
                requested_quantity: requestedByAsset.get(assetId),
                is_available: false,
                reason_code: "NOT_FOUND",
                conflicts: [],
            });
            continue;
        }

        const conflicts = bookingsByAsset.get(assetId) ?? [];
        const selfBookedQty = selfBookedByAsset.get(assetId) ?? 0;
        const requestedQty = requestedByAsset.get(assetId);

        result.set(
            assetId,
            computeAvailability({
                asset,
                overlappingBookings: conflicts,
                selfBookedQty,
                requestedQty,
            })
        );
    }

    return result;
};

/**
 * Convenience: check if all requested (asset, qty) pairs are available in
 * the given window. Returns `{ ok, unavailable[] }`. For callers that just
 * need a pass/fail gate with a human-friendly error payload.
 */
export const validateAvailabilityRequests = async (params: {
    tx?: TxOrDb;
    platformId: string;
    companyId?: string | null;
    requests: AvailabilityRequest[];
    window?: AvailabilityWindow;
    excludeEntity?: { type: "ORDER" | "SELF_PICKUP"; id: string };
    lockForUpdate?: boolean;
}): Promise<{
    ok: boolean;
    results: Map<string, AvailabilityResult>;
    unavailable: AvailabilityResult[];
}> => {
    const results = await checkAvailability(params);
    const unavailable: AvailabilityResult[] = [];
    for (const res of results.values()) {
        if (!res.is_available) unavailable.push(res);
    }
    return { ok: unavailable.length === 0, results, unavailable };
};
