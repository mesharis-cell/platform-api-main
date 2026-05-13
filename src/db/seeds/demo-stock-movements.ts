/**
 * Stock-movement ledger fixtures on the Event Chair (batch) asset.
 *
 * Seeds nine `stock_movements` rows so the M9 movement-history UI has at
 * least one hit per filter chip the front-end exposes:
 *   - OUTBOUND + INBOUND (audit-only, linked to the existing demo scan events)
 *   - ADJUSTMENT × 2 (one negative for "physical recount", one positive
 *     for "found one in storage")
 *   - OUTBOUND_AD_HOC × 4 (one per sub-reason: REPLACEMENT,
 *     INSTALL_CONSUMPTION, REPURPOSED, OTHER) with linked_entity to mix
 *     ORDER and SELF_PICKUP parents
 *   - WRITE_OFF DAMAGED, linked to the Order-5 inbound scan that flagged
 *     the cracked frame — covers the legacy settlement WRITE_OFF case
 *
 * Quantity deltas (per `StockMovementService.record` semantics):
 *   - OUTBOUND / INBOUND       → audit only, no qty change
 *   - ADJUSTMENT(-1)           → total -1, available -1
 *   - ADJUSTMENT(+1)           → total +1, available +1
 *   - OUTBOUND_AD_HOC(-1)      → total -1, available -1
 *   - WRITE_OFF(-1)            → total -1 ONLY (gotcha #39)
 *
 * Net effect on the chair (assuming caller-side bookings already applied):
 *   start: 30/30 → after orders + SPs reserve 14 → 30/16
 *   movements 3 & 4 cancel out → still 30/16
 *   four OUTBOUND_AD_HOC × -1     → 26/12
 *   one WRITE_OFF × -1 (total only) → 25/12
 *   final: total=25, available=12 (constraint 12 ≤ 25 ✓)
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import * as schema from "../schema";
import { DEMO_UUIDS, daysFromEpoch } from "./demo-deterministic";

export type SeedDemoStockMovementsOpts = {
    platformId: string;
    logisticsUserId: string;
    adminUserId: string;
};

const findScanEventId = async (
    orderUuid: string,
    scanType: "OUTBOUND" | "INBOUND"
): Promise<string> => {
    const [row] = await db
        .select({ id: schema.scanEvents.id })
        .from(schema.scanEvents)
        .where(
            and(
                eq(schema.scanEvents.order_id, orderUuid),
                eq(schema.scanEvents.scan_type, scanType)
            )
        )
        .limit(1);
    if (!row) {
        throw new Error(
            `Could not find ${scanType} scan event for order ${orderUuid} — demo-scan-events seed must run first.`
        );
    }
    return row.id;
};

export const seedDemoStockMovements = async (opts: SeedDemoStockMovementsOpts): Promise<void> => {
    console.log("📈 Seeding 9 demo stock-movement rows on Event Chair (batch)...");

    const chairId = DEMO_UUIDS.assets.eventChairsBatch;

    const order4OutboundScan = await findScanEventId(DEMO_UUIDS.orders.order4Delivered, "OUTBOUND");
    const order5InboundScan = await findScanEventId(DEMO_UUIDS.orders.order5Closed, "INBOUND");

    await db.insert(schema.stockMovements).values([
        // 1. OUTBOUND (audit only) — mirrors what the Order-4 outbound scan emitted.
        {
            id: DEMO_UUIDS.stockMovements.outboundFromOrder4,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: -5,
            movement_type: "OUTBOUND",
            note: "Outbound scan — Order ORD-DEMO-004 dispatch.",
            linked_entity_type: "ORDER",
            linked_entity_id: DEMO_UUIDS.orders.order4Delivered,
            linked_scan_event_id: order4OutboundScan,
            created_by: opts.logisticsUserId,
            created_at: daysFromEpoch(-4),
        },
        // 2. INBOUND (audit only) — Order-5 return.
        {
            id: DEMO_UUIDS.stockMovements.inboundFromOrder5,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: 3,
            movement_type: "INBOUND",
            note: "Inbound scan — Order ORD-DEMO-005 return.",
            linked_entity_type: "ORDER",
            linked_entity_id: DEMO_UUIDS.orders.order5Closed,
            linked_scan_event_id: order5InboundScan,
            created_by: opts.logisticsUserId,
            created_at: daysFromEpoch(-7),
        },
        // 3. ADJUSTMENT (-1) — physical recount mismatch.
        {
            id: DEMO_UUIDS.stockMovements.adjustmentNeg1,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: -1,
            movement_type: "ADJUSTMENT",
            note: "Physical recount — one chair short of system count.",
            linked_entity_type: null,
            linked_entity_id: null,
            linked_scan_event_id: null,
            created_by: opts.adminUserId,
            created_at: daysFromEpoch(-6),
        },
        // 4. ADJUSTMENT (+1) — found one in storage.
        {
            id: DEMO_UUIDS.stockMovements.adjustmentPos1,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: 1,
            movement_type: "ADJUSTMENT",
            note: "Found one extra unit in long-term storage during audit.",
            linked_entity_type: null,
            linked_entity_id: null,
            linked_scan_event_id: null,
            created_by: opts.adminUserId,
            created_at: daysFromEpoch(-5),
        },
        // 5. OUTBOUND_AD_HOC — REPLACEMENT (linked to Order 3 / CONFIRMED).
        {
            id: DEMO_UUIDS.stockMovements.adHocReplacement,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: -1,
            movement_type: "OUTBOUND_AD_HOC",
            outbound_ad_hoc_reason: "REPLACEMENT",
            note: "Broken on delivery — replaced from stock.",
            linked_entity_type: "ORDER",
            linked_entity_id: DEMO_UUIDS.orders.order3Confirmed,
            linked_scan_event_id: null,
            created_by: opts.logisticsUserId,
            created_at: daysFromEpoch(-2.5),
        },
        // 6. OUTBOUND_AD_HOC — INSTALL_CONSUMPTION (linked to SP-3 / CONFIRMED).
        {
            id: DEMO_UUIDS.stockMovements.adHocInstallConsumption,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: -1,
            movement_type: "OUTBOUND_AD_HOC",
            outbound_ad_hoc_reason: "INSTALL_CONSUMPTION",
            note: "Consumed during install — bracket sacrificed for fitting.",
            linked_entity_type: "SELF_PICKUP",
            linked_entity_id: DEMO_UUIDS.selfPickups.sp3Confirmed,
            linked_scan_event_id: null,
            created_by: opts.logisticsUserId,
            created_at: daysFromEpoch(-2),
        },
        // 7. OUTBOUND_AD_HOC — REPURPOSED (linked to Order 1).
        {
            id: DEMO_UUIDS.stockMovements.adHocRepurposed,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: -1,
            movement_type: "OUTBOUND_AD_HOC",
            outbound_ad_hoc_reason: "REPURPOSED",
            note: "Moved to another active order to backfill shortfall.",
            linked_entity_type: "ORDER",
            linked_entity_id: DEMO_UUIDS.orders.order1Submitted,
            linked_scan_event_id: null,
            created_by: opts.logisticsUserId,
            created_at: daysFromEpoch(-1.5),
        },
        // 8. OUTBOUND_AD_HOC — OTHER (no linked entity, multi-line structured note).
        {
            id: DEMO_UUIDS.stockMovements.adHocOther,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: -1,
            movement_type: "OUTBOUND_AD_HOC",
            outbound_ad_hoc_reason: "OTHER",
            note: "Requested by: Alice Sales\nVenue: HQ Conference Room\nDetails: Q2 partner event setup",
            linked_entity_type: null,
            linked_entity_id: null,
            linked_scan_event_id: null,
            created_by: opts.adminUserId,
            created_at: daysFromEpoch(-1),
        },
        // 9. WRITE_OFF — DAMAGED (legacy settlement, linked to Order-5 inbound scan).
        {
            id: DEMO_UUIDS.stockMovements.writeOffDamaged,
            platform_id: opts.platformId,
            asset_id: chairId,
            asset_family_id: null,
            delta: -1,
            movement_type: "WRITE_OFF",
            write_off_reason: "DAMAGED",
            note: "Inbound settlement — one unit returned damaged beyond repair.",
            linked_entity_type: "ORDER",
            linked_entity_id: DEMO_UUIDS.orders.order5Closed,
            linked_scan_event_id: order5InboundScan,
            created_by: opts.logisticsUserId,
            created_at: daysFromEpoch(-7),
        },
    ]);

    // Apply quantity deltas to mirror what StockMovementService.record() would
    // do at production time. OUTBOUND / INBOUND are audit-only (booking
    // lifecycle owns availability for those). Net change:
    //   four OUTBOUND_AD_HOC(-1) → total -4, available -4
    //   one ADJUSTMENT(-1)       → total -1, available -1
    //   one ADJUSTMENT(+1)       → total +1, available +1
    //   one WRITE_OFF(-1)        → total -1 only (gotcha #39)
    //   ───────────────────────────────────────────────────────
    //   net                      → total -5, available -4
    // Relative deltas so this stays correct regardless of how earlier seeds
    // (orders, self-pickups) leave the chair's available_quantity.
    await db
        .update(schema.assets)
        .set({
            total_quantity: sql`${schema.assets.total_quantity} - 5`,
            available_quantity: sql`${schema.assets.available_quantity} - 4`,
        })
        .where(eq(schema.assets.id, chairId));

    console.log("  ✓ 9 stock movements seeded (Event Chair total -5, available -4)");
};
