/**
 * Backfill asset_bookings for pre-CONFIRMED orders.
 *
 * After Phase 2 lands (orders book at SUBMIT), any order that was already
 * in PRICING_REVIEW / PENDING_APPROVAL / QUOTED at deploy time has NO
 * asset_bookings rows — those statuses pre-date the timing flip.
 *
 * approveQuote keeps an idempotent safety-net insert, so if such an order
 * progresses through approve, it gets bookings created at that moment. But
 * until then, the order's inventory is invisible to availability calculations
 * — another client could submit overlapping items and oversell.
 *
 * This script closes that gap by populating bookings for every pre-CONFIRMED
 * order that's missing them. Idempotent: re-runs are safe because we only
 * touch orders WHERE NOT EXISTS (any booking for the order).
 *
 * For each order, we also decrement assets.available_quantity by the booked
 * quantity, mirroring what submit/approveQuote do. This restores the
 * snapshot's accuracy.
 *
 * Run:
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts \
 *     ./src/db/scripts/backfill-pre-confirmed-bookings.ts --dry-run
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts \
 *     ./src/db/scripts/backfill-pre-confirmed-bookings.ts
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pool } from "../index";
import { assertAppEnv } from "../safety/guards";
import { assetBookings, assets, orderItems, orders } from "../schema";
import { computeBookingWindow } from "../../app/modules/order/order.utils";

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const TENTATIVE_STATUSES: ("PRICING_REVIEW" | "PENDING_APPROVAL" | "QUOTED")[] = [
    "PRICING_REVIEW",
    "PENDING_APPROVAL",
    "QUOTED",
];

async function main() {
    assertAppEnv(["staging", "production"]);
    const dryRun = hasFlag("dry-run");

    console.log(`\n=== Backfill asset_bookings for pre-CONFIRMED orders ===`);
    console.log(`Mode: ${dryRun ? "DRY-RUN" : "APPLY"}\n`);

    // 1. Find candidate orders (tentative status + no bookings yet).
    const candidates = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            platform_id: orders.platform_id,
            company_id: orders.company_id,
            order_status: orders.order_status,
            event_start_date: orders.event_start_date,
            event_end_date: orders.event_end_date,
        })
        .from(orders)
        .leftJoin(assetBookings, eq(assetBookings.order_id, orders.id))
        .where(
            and(
                inArray(orders.order_status, TENTATIVE_STATUSES),
                isNull(orders.deleted_at),
                isNull(assetBookings.id) // no booking joined → none exists
            )
        );

    // The LEFT JOIN + isNull(assetBookings.id) filter returns one row per
    // (order, missing_booking) combo. Dedupe by order id.
    const uniqueOrderMap = new Map<string, (typeof candidates)[number]>();
    for (const c of candidates) {
        if (!uniqueOrderMap.has(c.id)) uniqueOrderMap.set(c.id, c);
    }
    const uniqueOrders = Array.from(uniqueOrderMap.values());

    console.log(`Candidates found: ${uniqueOrders.length}`);

    if (uniqueOrders.length === 0) {
        console.log("Nothing to backfill. Exiting.");
        await pool.end();
        return;
    }

    let totalBookingsCreated = 0;
    let totalQuantityHeld = 0;
    let ordersProcessed = 0;
    let ordersSkipped = 0;

    for (const order of uniqueOrders) {
        // Pull the items + per-item refurb estimate snapshot.
        const items = await db
            .select({
                asset_id: orderItems.asset_id,
                quantity: orderItems.quantity,
                refurb_days: orderItems.maintenance_refurb_days_snapshot,
            })
            .from(orderItems)
            .where(eq(orderItems.order_id, order.id));

        if (items.length === 0) {
            console.warn(`⚠️  ${order.order_id}: no order_items, skipping`);
            ordersSkipped++;
            continue;
        }

        const bookingRows = items.map((item) => {
            const { blockedFrom, blockedUntil } = computeBookingWindow(
                order.event_start_date,
                order.event_end_date,
                item.refurb_days
            );
            return {
                asset_id: item.asset_id,
                order_id: order.id,
                quantity: item.quantity,
                blocked_from: blockedFrom,
                blocked_until: blockedUntil,
            };
        });

        const totalQty = items.reduce((s, i) => s + i.quantity, 0);
        console.log(
            `  ${order.order_id} (${order.order_status}) — ${items.length} item(s), total qty ${totalQty}`
        );

        if (!dryRun) {
            await db.transaction(async (tx) => {
                // Re-check inside the tx — another script run or live submit
                // might have created bookings since we read the candidate list.
                const existing = await tx
                    .select({ id: assetBookings.id })
                    .from(assetBookings)
                    .where(eq(assetBookings.order_id, order.id))
                    .limit(1);
                if (existing.length > 0) {
                    console.log(`    skip — bookings now exist (concurrent backfill or approve)`);
                    return;
                }

                await tx.insert(assetBookings).values(bookingRows);

                for (const item of items) {
                    await tx
                        .update(assets)
                        .set({
                            available_quantity: sql`GREATEST(0, ${assets.available_quantity} - ${item.quantity})`,
                        })
                        .where(eq(assets.id, item.asset_id));
                }
            });
        }

        totalBookingsCreated += bookingRows.length;
        totalQuantityHeld += totalQty;
        ordersProcessed++;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Orders processed: ${ordersProcessed}`);
    console.log(`Orders skipped:   ${ordersSkipped}`);
    console.log(`Bookings created: ${totalBookingsCreated}`);
    console.log(`Total qty held:   ${totalQuantityHeld}`);
    console.log(dryRun ? `\n(dry-run — no rows written)\n` : `\n✅ Backfill complete.\n`);

    await pool.end();
}

main().catch((err) => {
    console.error(`\n❌ Backfill failed:`, err);
    process.exitCode = 1;
    pool.end().catch(() => {});
});
