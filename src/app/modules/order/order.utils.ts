import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
    assetBookings,
    assets,
    financialStatusEnum,
    orderItems,
    orders,
    orderStatusEnum,
    scanEvents,
} from "../../../db/schema";
import { sortOrderType } from "../../constants/common";
import { AuthUser } from "../../interface/common";
import CustomizedError from "../../error/customized-error";
import httpStatus from "http-status";
import { AssetStatus } from "../asset/assets.interfaces";

// Sortable fields for order queries
export const orderSortableFields: Record<string, any> = {
    order_id: orders.order_id,
    order_status: orders.order_status,
    financial_status: orders.financial_status,
    event_start_date: orders.event_start_date,
    created_at: orders.created_at,
    updated_at: orders.updated_at,
};

// Query validation configuration
export const orderQueryValidationConfig = {
    sort_by: Object.keys(orderSortableFields),
    sort_order: sortOrderType,
    order_status: orderStatusEnum.enumValues,
    financial_status: financialStatusEnum.enumValues,
};

// ------------------------------------- ORDER ID GENERATOR -------------------------------------
// FORMAT: ORD-YYYYMMDD-XXX
export const orderIdGenerator = async (platformId: string): Promise<string> => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, ""); // YYYYMMDD

    // Find highest sequence number for today
    const prefix = `ORD-${dateStr}-`;
    const todayOrders = await db
        .select({ order_id: orders.order_id })
        .from(orders)
        .where(
            and(eq(orders.platform_id, platformId), sql`${orders.order_id} LIKE ${prefix + "%"}`)
        )
        .orderBy(desc(orders.order_id))
        .limit(1);

    let sequence = 1;
    if (todayOrders.length > 0) {
        const lastOrderId = todayOrders[0].order_id;
        const lastSequence = parseInt(lastOrderId.split("-")[2], 10);
        sequence = lastSequence + 1;
    }

    const sequenceStr = sequence.toString().padStart(3, "0");
    return `${prefix}${sequenceStr}`;
};

// ----------------------------------- STATUS TRANSITIONS -------------------------------------
export const VALID_STATE_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ["SUBMITTED"],
    SUBMITTED: ["PRICING_REVIEW"],
    PRICING_REVIEW: ["PENDING_APPROVAL"],
    PENDING_APPROVAL: ["QUOTED"],
    QUOTED: ["CONFIRMED", "DECLINED"],
    DECLINED: [],
    CONFIRMED: ["IN_PREPARATION"],
    IN_PREPARATION: ["READY_FOR_DELIVERY"],
    READY_FOR_DELIVERY: ["IN_TRANSIT"],
    IN_TRANSIT: ["DELIVERED"],
    DELIVERED: ["IN_USE"],
    IN_USE: ["DERIG"],
    DERIG: ["AWAITING_RETURN"],
    AWAITING_RETURN: ["RETURN_IN_TRANSIT"],
    RETURN_IN_TRANSIT: ["CLOSED"],
    CLOSED: [],
};

export function isValidTransition(fromStatus: string, toStatus: string): boolean {
    const allowedTransitions = VALID_STATE_TRANSITIONS[fromStatus];
    if (!allowedTransitions) {
        return false;
    }
    return allowedTransitions.includes(toStatus);
}

// ----------------------------------- VALIDATE ROLE-BASED TRANSITION --------------------------
export function validateRoleBasedTransition(
    user: AuthUser,
    fromStatus: string,
    toStatus: string
): boolean {
    // ADMIN can force any valid transition
    if (user.role === "ADMIN") {
        return true;
    }

    // CLIENT can only approve/decline quotes
    if (user.role === "CLIENT") {
        if (fromStatus === "QUOTED" && (toStatus === "CONFIRMED" || toStatus === "DECLINED")) {
            return true;
        }
        return false;
    }

    // LOGISTICS can progress fulfillment stages
    if (user.role === "LOGISTICS") {
        const allowedLogisticsTransitions = [
            "CONFIRMED->IN_PREPARATION",
            "IN_PREPARATION->READY_FOR_DELIVERY",
            "READY_FOR_DELIVERY->IN_TRANSIT",
            "IN_TRANSIT->DELIVERED",
            "DELIVERED->IN_USE",
            "IN_USE->DERIG",
            "DERIG->AWAITING_RETURN",
            "AWAITING_RETURN->RETURN_IN_TRANSIT",
            "RETURN_IN_TRANSIT->CLOSED",
        ];

        const transitionKey = `${fromStatus}->${toStatus}`;
        return allowedLogisticsTransitions.includes(transitionKey);
    }

    return false;
}

/**
 * Calculate blocked period for an order including all buffers
 * Feedback #5: Adds 5-day prep + 3-day return buffers
 * Feedback #2: Adds refurb days if item needs refurbishment
 */

// Preparation buffer days (time needed before event to prepare assets)
export const PREP_BUFFER_DAYS = 5;

// Return buffer days (time needed after event for return and processing)
export const RETURN_BUFFER_DAYS = 3;

// ----------------------------------- VALIDATE INBOUND SCANNING COMPLETE ----------------------
/**
 * Validates that all order items have been scanned in (inbound)
 * Returns true if all items scanned, false otherwise
 */
export async function validateInboundScanningComplete(orderId: string): Promise<boolean> {
    // Get all order items
    const items = await db.query.orderItems.findMany({
        where: eq(orderItems.order_id, orderId),
    });

    if (items.length === 0) {
        return true; // No items to scan
    }

    // Get all inbound scan events for this order
    const inboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "INBOUND")),
    });

    // Check if each item has been fully scanned in
    for (const item of items) {
        const scannedQuantity = inboundScans
            .filter((scan) => scan.asset_id === item.asset_id)
            .reduce((sum, scan) => sum + scan.quantity, 0);

        if (scannedQuantity < item.quantity) {
            console.log(
                `❌ Item ${item.asset_name} not fully scanned: ${scannedQuantity}/${item.quantity}`
            );
            return false;
        }
    }

    console.log(`✅ All items scanned in for order ${orderId}`);
    return true;
}

/**
 * Releases all bookings for an order and restores affected asset availability.
 *
 * Inventory rule:
 * - `available_quantity` is adjusted at booking lifecycle boundaries:
 *   - decrease on booking creation (quote approval)
 *   - increase on booking release (close/cancel)
 * - scan events should not mutate `available_quantity`.
 */
/**
 * Releases asset bookings linked to either an order or a self-pickup, and restores
 * the corresponding available_quantity on each affected asset.
 *
 * Previously named releaseOrderBookingsAndRestoreAvailability. The old name is
 * re-exported below for backward compat (and to keep the verify-inventory-flow
 * linter regex passing).
 */
export async function releaseBookingsAndRestoreAvailability(
    tx: any,
    parentType: "ORDER" | "SELF_PICKUP",
    parentId: string,
    platformId: string,
    returnedByAsset?: Map<string, number> // assetId → actual returned qty (net restore)
): Promise<void> {
    const parentCondition =
        parentType === "ORDER"
            ? eq(assetBookings.order_id, parentId)
            : eq(assetBookings.self_pickup_id, parentId);

    const bookedByAsset = await tx
        .select({
            asset_id: assetBookings.asset_id,
            booked_quantity: sql<number>`COALESCE(SUM(${assetBookings.quantity}), 0)`,
        })
        .from(assetBookings)
        .where(parentCondition)
        .groupBy(assetBookings.asset_id);

    if (bookedByAsset.length === 0) {
        await tx.delete(assetBookings).where(parentCondition);
        return;
    }

    await tx.delete(assetBookings).where(parentCondition);

    const affectedAssetIds = bookedByAsset.map((row: any) => row.asset_id);

    for (const row of bookedByAsset) {
        const bookedQty = Number(row.booked_quantity || 0);
        // Net restore: if returnedByAsset is provided, restore only what came back.
        // Fallback to full booked amount for cancellations and serialized items.
        const restoreQty = returnedByAsset
            ? Math.min(bookedQty, returnedByAsset.get(row.asset_id) ?? bookedQty)
            : bookedQty;
        if (restoreQty <= 0) continue;

        await tx
            .update(assets)
            .set({
                available_quantity: sql`LEAST(${assets.total_quantity}, GREATEST(0, ${assets.available_quantity} + ${restoreQty}))`,
                updated_at: new Date(),
            })
            .where(and(eq(assets.id, row.asset_id), eq(assets.platform_id, platformId)));
    }

    // Sync statuses for affected assets based on whether they still have active bookings.
    const remainingBookings = await tx
        .select({
            asset_id: assetBookings.asset_id,
            count: count(),
        })
        .from(assetBookings)
        .where(inArray(assetBookings.asset_id, affectedAssetIds))
        .groupBy(assetBookings.asset_id);

    const hasRemainingBookings = new Set(
        remainingBookings
            .filter((row: any) => Number(row.count || 0) > 0)
            .map((row: any) => row.asset_id)
    );

    for (const assetId of affectedAssetIds) {
        const nextStatus = hasRemainingBookings.has(assetId) ? "BOOKED" : "AVAILABLE";

        await tx
            .update(assets)
            .set({
                // Avoid clobbering maintenance/transformed statuses.
                status: sql`CASE
                    WHEN ${assets.status} IN ('BOOKED', 'OUT', 'AVAILABLE') THEN ${nextStatus}
                    ELSE ${assets.status}
                END`,
                updated_at: new Date(),
            })
            .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)));
    }
}

/** @deprecated Use releaseBookingsAndRestoreAvailability with parentType param. Kept for
 *  backward compat and the verify-inventory-flow.ts linter regex. */
export async function releaseOrderBookingsAndRestoreAvailability(
    tx: any,
    orderId: string,
    platformId: string
): Promise<void> {
    return releaseBookingsAndRestoreAvailability(tx, "ORDER", orderId, platformId);
}

/**
 * Partial-release helper for SP partial handover / skip (migration 0048).
 *
 * On completion of a handover where the client took fewer units than
 * originally booked, we need to (a) reduce the remaining booking so the
 * return expects only what was actually collected, and (b) restore the
 * un-collected delta to asset.available_quantity so that stock becomes
 * available for the next booking immediately.
 *
 * Per-asset logic:
 *   - scanned === 0 → delete the booking row, restore full booked qty
 *   - 0 < scanned < booked → update booking row to scanned qty, restore (booked - scanned)
 *   - scanned >= booked → no-op
 *
 * Unlike `releaseBookingsAndRestoreAvailability`, this does NOT delete all
 * bookings — the outstanding (still-collected) portion stays booked for
 * the return phase.
 */
export async function reduceBookingsForScannedOutbound(
    tx: any,
    parentType: "ORDER" | "SELF_PICKUP",
    parentId: string,
    platformId: string,
    scannedByAsset: Map<string, number>
): Promise<void> {
    const parentCondition =
        parentType === "ORDER"
            ? eq(assetBookings.order_id, parentId)
            : eq(assetBookings.self_pickup_id, parentId);

    const bookedByAsset = await tx
        .select({
            asset_id: assetBookings.asset_id,
            booked_quantity: sql<number>`COALESCE(SUM(${assetBookings.quantity}), 0)`,
        })
        .from(assetBookings)
        .where(parentCondition)
        .groupBy(assetBookings.asset_id);

    for (const row of bookedByAsset) {
        const assetId = row.asset_id;
        const bookedQty = Number(row.booked_quantity || 0);
        const scannedQty = scannedByAsset.get(assetId);
        if (scannedQty === undefined) continue;
        if (scannedQty >= bookedQty) continue; // full-scan: no booking change

        const restoreQty = bookedQty - scannedQty;

        if (scannedQty === 0) {
            await tx
                .delete(assetBookings)
                .where(and(parentCondition, eq(assetBookings.asset_id, assetId)));
        } else {
            // Consolidate: delete existing rows + insert one canonical row
            // with the reduced quantity. Simpler than partial-row-updates
            // when bookings were originally split across multiple rows.
            const existing = await tx
                .select({
                    order_id: assetBookings.order_id,
                    self_pickup_id: assetBookings.self_pickup_id,
                    blocked_from: assetBookings.blocked_from,
                    blocked_until: assetBookings.blocked_until,
                })
                .from(assetBookings)
                .where(and(parentCondition, eq(assetBookings.asset_id, assetId)))
                .limit(1);
            const keep = existing[0];
            await tx
                .delete(assetBookings)
                .where(and(parentCondition, eq(assetBookings.asset_id, assetId)));
            if (keep) {
                await tx.insert(assetBookings).values({
                    order_id: keep.order_id,
                    self_pickup_id: keep.self_pickup_id,
                    asset_id: assetId,
                    quantity: scannedQty,
                    blocked_from: keep.blocked_from,
                    blocked_until: keep.blocked_until,
                });
            }
        }

        await tx
            .update(assets)
            .set({
                available_quantity: sql`LEAST(${assets.total_quantity}, GREATEST(0, ${assets.available_quantity} + ${restoreQty}))`,
                updated_at: new Date(),
            })
            .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)));

        // Asset status sync: if fully skipped (scanned === 0) AND no other
        // bookings remain, flip BOOKED/OUT back to AVAILABLE.
        if (scannedQty === 0) {
            const remaining = await tx
                .select({ count: count() })
                .from(assetBookings)
                .where(eq(assetBookings.asset_id, assetId));
            if (Number(remaining[0]?.count || 0) === 0) {
                await tx
                    .update(assets)
                    .set({
                        status: sql`CASE
                            WHEN ${assets.status} IN ('BOOKED', 'OUT', 'AVAILABLE') THEN 'AVAILABLE'
                            ELSE ${assets.status}
                        END`,
                        updated_at: new Date(),
                    })
                    .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)));
            }
        }
    }
}

export type UnavailableItem = {
    asset_id: string;
    asset_name: string;
    requested: number;
    available: number;
    next_available_date?: Date;
};

export type AvailableItem = {
    id: string;
    status: AssetStatus;
    refurb_days_estimate: number | null;
};

// ----------------------------------- CHECK ASSETS FOR ORDER -----------------------------------
export const checkAssetsForOrder = async (
    platformId: string,
    companyId: string,
    requiredAssets: { id: string; quantity: number }[],
    eventStartDate: Date,
    eventEndDate: Date
): Promise<Array<typeof assets.$inferSelect>> => {
    const assetIds = requiredAssets.map((asset) => asset.id);

    // Step 1: Verify assets exist and belong to the company
    const foundAssets = await db
        .select()
        .from(assets)
        .where(
            and(
                inArray(assets.id, assetIds),
                eq(assets.company_id, companyId),
                eq(assets.platform_id, platformId),
                isNull(assets.deleted_at)
            )
        );

    if (foundAssets.length !== assetIds.length) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "One or more assets not found or do not belong to your company"
        );
    }

    // Step 2: Verify all assets have AVAILABLE status
    const unavailableAssets = foundAssets.filter((a) => a.status !== "AVAILABLE");
    if (unavailableAssets.length > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot order unavailable assets: ${unavailableAssets.map((a) => a.name).join(", ")}`
        );
    }

    const unavailableItems: Array<UnavailableItem> = [];
    const availableItems: Array<typeof assets.$inferSelect> = [];

    // Step 3: Check date-based availability for requested quantities
    for (const item of requiredAssets) {
        // Find asset in the foundAssets array
        const asset = foundAssets.find((a) => a.id === item.id);
        if (!asset) {
            throw new CustomizedError(httpStatus.NOT_FOUND, `Asset "${item.id}" not found`);
        }

        // Query overlapping bookings for the event period
        const overlappingBookings = await db.query.assetBookings.findMany({
            where: and(
                eq(assetBookings.asset_id, item.id),
                sql`${assetBookings.blocked_from} <= ${eventStartDate}`,
                sql`${assetBookings.blocked_until} >= ${eventEndDate}`
            ),
            with: {
                order: {
                    columns: {
                        id: true,
                        order_id: true,
                    },
                },
            },
        });

        // Calculate available quantity
        const bookedQuantity = overlappingBookings.reduce(
            (sum, booking) => sum + booking.quantity,
            0
        );
        // const availableQuantity = Math.max(0, item.quantity - bookedQuantity);
        const availableQuantity = Math.max(0, asset.total_quantity - bookedQuantity);

        // If insufficient quantity, track for error message
        if (availableQuantity < item.quantity) {
            // Find next available date from latest booking end
            let nextAvailableDate: Date | undefined;
            if (overlappingBookings.length > 0) {
                const latestBookingEnd = new Date(
                    Math.max(...overlappingBookings.map((b) => new Date(b.blocked_until).getTime()))
                );
                nextAvailableDate = new Date(latestBookingEnd);
                nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
            }

            unavailableItems.push({
                asset_id: item.id,
                asset_name: asset.name,
                requested: item.quantity,
                available: availableQuantity,
                next_available_date: nextAvailableDate,
            });
        } else {
            const remainingQuantity = Math.max(0, availableQuantity - item.quantity);

            // const assetStatus: AssetStatus =
            //     asset.tracking_method === "INDIVIDUAL"
            //         ? "BOOKED"
            //         : remainingQuantity <= 0
            //             ? "BOOKED"
            //             : "AVAILABLE";

            const assetStatus: AssetStatus = "BOOKED";

            availableItems.push({
                ...asset,
                status: assetStatus,
                available_quantity: remainingQuantity,
            });
        }
    }

    // Step 4: Throw error if any items are unavailable
    if (unavailableItems.length > 0) {
        const unavailableList = unavailableItems
            .map(({ asset_name, requested, available, next_available_date }) => {
                const nextDate = next_available_date
                    ? ` (available from ${new Date(next_available_date).toLocaleDateString()})`
                    : "";

                return `${asset_name}: requested ${requested}, available ${available} ${nextDate}`;
            })
            .join("; ");

        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Insufficient availability for requested dates: ${unavailableList}`
        );
    }

    return availableItems;
};

export const NON_CANCELLABLE_STATUSES = [
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "DERIG",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
    "DECLINED",
    "CANCELLED",
];

export const CANCEL_REASONS = [
    "client_requested",
    "asset_unavailable",
    "pricing_dispute",
    "event_cancelled",
    "fabrication_failed",
    "other",
];
