/**
 * Demo scan events — one row per scanTypeEnum value so the docs "Scan Types"
 * gallery can screenshot every variant clients may see.
 *
 *   Order 4 (DELIVERED): OUTBOUND, OUTBOUND_TRUCK_PHOTOS, ON_SITE_CAPTURE,
 *       DERIG_CAPTURE (lifecycle-ordered from warehouse → on-site → derig).
 *   Order 5 (CLOSED):    RETURN_TRUCK_PHOTOS, INBOUND-with-discrepancy
 *       (return truck photos arrive before inbound scan + condition flag).
 *
 * All photos are placehold.co URLs (offline-friendly visually, no S3 setup).
 * `scanned_by` references the seeded logistics user (Jordan Maxwell) so the
 * scan-activity timeline displays a real human name in screenshots.
 *
 * Timestamps are deterministic (pinned-epoch offsets in days, decimals allowed
 * for sub-day ordering — e.g. `-3.9` is 2.4 hours after `-4`).
 */

import { db } from "../index";
import * as schema from "../schema";
import { DEMO_UUIDS, daysFromEpoch } from "./demo-deterministic";

const photo = (label: string, color: string): string =>
    `https://placehold.co/512x512/${color}/FFFFFF?text=${encodeURIComponent(label)}`;

export type SeedDemoScanEventsOpts = {
    logisticsUserId: string;
};

export const seedDemoScanEvents = async (opts: SeedDemoScanEventsOpts): Promise<void> => {
    console.log("📷 Seeding demo scan events (Order 4 + Order 5)...");

    // ─── Order 4 (DELIVERED) — outbound + derig ────────────────────
    const [outboundEvent] = await db
        .insert(schema.scanEvents)
        .values({
            order_id: DEMO_UUIDS.orders.order4Delivered,
            scan_type: "OUTBOUND",
            quantity: 6,
            condition: "GREEN",
            scanned_by: opts.logisticsUserId,
            scanned_at: daysFromEpoch(-4),
            notes: "Outbound scan complete — all items loaded.",
        })
        .returning({ id: schema.scanEvents.id });

    await db.insert(schema.scanEventAssets).values([
        {
            scan_event_id: outboundEvent.id,
            asset_id: DEMO_UUIDS.assets.eventChairsBatch,
            quantity: 5,
        },
        {
            scan_event_id: outboundEvent.id,
            asset_id: DEMO_UUIDS.assets.ledScreen1,
            quantity: 1,
        },
    ]);

    await db.insert(schema.scanEventMedia).values([
        {
            scan_event_id: outboundEvent.id,
            url: photo("Truck Outbound 1", "1f2937"),
            note: "Loaded — truck side view",
            media_kind: "TRUCK_OUTBOUND",
            sort_order: 0,
        },
        {
            scan_event_id: outboundEvent.id,
            url: photo("Truck Outbound 2", "1f2937"),
            note: "Loaded — rear view, secured",
            media_kind: "TRUCK_OUTBOUND",
            sort_order: 1,
        },
    ]);

    // ─── OUTBOUND_TRUCK_PHOTOS — dedicated scan for warehouse→site truck ───
    const [outboundTruckEvent] = await db
        .insert(schema.scanEvents)
        .values({
            order_id: DEMO_UUIDS.orders.order4Delivered,
            scan_type: "OUTBOUND_TRUCK_PHOTOS",
            scanned_by: opts.logisticsUserId,
            scanned_at: daysFromEpoch(-3.9),
            notes: "Truck dispatch photos — plate + cargo secured.",
        })
        .returning({ id: schema.scanEvents.id });

    await db.insert(schema.scanEventMedia).values([
        {
            scan_event_id: outboundTruckEvent.id,
            url: photo("Truck Plate", "0f172a"),
            note: "License plate + driver visible",
            media_kind: "TRUCK_OUTBOUND",
            sort_order: 0,
        },
        {
            scan_event_id: outboundTruckEvent.id,
            url: photo("Cargo Strapped", "1f2937"),
            note: "Cargo strapped, doors closing",
            media_kind: "TRUCK_OUTBOUND",
            sort_order: 1,
        },
        {
            scan_event_id: outboundTruckEvent.id,
            url: photo("Truck Ready", "1f2937"),
            note: "Ready for dispatch",
            media_kind: "TRUCK_OUTBOUND",
            sort_order: 2,
        },
    ]);

    // ─── ON_SITE_CAPTURE — mid-event checkpoint after delivery ──────────
    const [onSiteEvent] = await db
        .insert(schema.scanEvents)
        .values({
            order_id: DEMO_UUIDS.orders.order4Delivered,
            scan_type: "ON_SITE_CAPTURE",
            scanned_by: opts.logisticsUserId,
            scanned_at: daysFromEpoch(-1.5),
            notes: "Setup complete, all screens tested.",
        })
        .returning({ id: schema.scanEvents.id });

    await db.insert(schema.scanEventMedia).values([
        {
            scan_event_id: onSiteEvent.id,
            url: photo("On Site 1", "0ea5e9"),
            note: "Stage fully rigged — front view",
            media_kind: "ON_SITE",
            sort_order: 0,
        },
        {
            scan_event_id: onSiteEvent.id,
            url: photo("On Site 2", "0284c7"),
            note: "LED wall lit + seating arranged",
            media_kind: "ON_SITE",
            sort_order: 1,
        },
    ]);

    const [derigEvent] = await db
        .insert(schema.scanEvents)
        .values({
            order_id: DEMO_UUIDS.orders.order4Delivered,
            scan_type: "DERIG_CAPTURE",
            quantity: 6,
            condition: "GREEN",
            scanned_by: opts.logisticsUserId,
            scanned_at: daysFromEpoch(2),
            notes: "Derig capture before pack-down.",
        })
        .returning({ id: schema.scanEvents.id });

    await db.insert(schema.scanEventAssets).values([
        {
            scan_event_id: derigEvent.id,
            asset_id: DEMO_UUIDS.assets.eventChairsBatch,
            quantity: 5,
        },
        {
            scan_event_id: derigEvent.id,
            asset_id: DEMO_UUIDS.assets.ledScreen1,
            quantity: 1,
        },
    ]);

    await db.insert(schema.scanEventMedia).values([
        {
            scan_event_id: derigEvent.id,
            url: photo("Derig 1", "7c2d12"),
            note: "Stage area before pack-down",
            media_kind: "DERIG",
            sort_order: 0,
        },
        {
            scan_event_id: derigEvent.id,
            url: photo("Derig 2", "7c2d12"),
            note: "LED panel pre-removal",
            media_kind: "DERIG",
            sort_order: 1,
        },
        {
            scan_event_id: derigEvent.id,
            url: photo("Derig 3", "7c2d12"),
            note: "Chairs stacked + ready",
            media_kind: "DERIG",
            sort_order: 2,
        },
    ]);

    // ─── Order 5 (CLOSED) — return truck photos + inbound with discrepancy ───
    const [returnTruckEvent] = await db
        .insert(schema.scanEvents)
        .values({
            order_id: DEMO_UUIDS.orders.order5Closed,
            scan_type: "RETURN_TRUCK_PHOTOS",
            scanned_by: opts.logisticsUserId,
            scanned_at: daysFromEpoch(-7.2),
            notes: "Return truck photos on arrival back at warehouse.",
        })
        .returning({ id: schema.scanEvents.id });

    await db.insert(schema.scanEventMedia).values([
        {
            scan_event_id: returnTruckEvent.id,
            url: photo("Return Arrival", "1e293b"),
            note: "Truck arriving at dock",
            media_kind: "TRUCK_RETURN",
            sort_order: 0,
        },
        {
            scan_event_id: returnTruckEvent.id,
            url: photo("Return Unload", "1e293b"),
            note: "Doors open, unload in progress",
            media_kind: "TRUCK_RETURN",
            sort_order: 1,
        },
        {
            scan_event_id: returnTruckEvent.id,
            url: photo("Return Cargo", "1e293b"),
            note: "All items accounted for — ready for inbound scan",
            media_kind: "TRUCK_RETURN",
            sort_order: 2,
        },
    ]);

    const [inboundEvent] = await db
        .insert(schema.scanEvents)
        .values({
            order_id: DEMO_UUIDS.orders.order5Closed,
            scan_type: "INBOUND",
            quantity: 4,
            condition: "ORANGE",
            scanned_by: opts.logisticsUserId,
            scanned_at: daysFromEpoch(-7),
            discrepancy_reason: "BROKEN",
            notes: "1× backdrop returned with cracked frame — flagged for service request.",
        })
        .returning({ id: schema.scanEvents.id });

    await db.insert(schema.scanEventAssets).values([
        {
            scan_event_id: inboundEvent.id,
            asset_id: DEMO_UUIDS.assets.eventChairsBatch,
            quantity: 3,
        },
        {
            scan_event_id: inboundEvent.id,
            asset_id: DEMO_UUIDS.assets.backdropGreen1,
            quantity: 1,
        },
    ]);

    await db.insert(schema.scanEventMedia).values([
        {
            scan_event_id: inboundEvent.id,
            url: photo("Return Wide", "374151"),
            note: "Truck arrived, return area wide shot",
            media_kind: "RETURN_WIDE",
            sort_order: 0,
        },
        {
            scan_event_id: inboundEvent.id,
            url: photo("Damage", "dc2626"),
            note: "Cracked corner — backdrop frame",
            media_kind: "DAMAGE",
            sort_order: 1,
        },
    ]);

    console.log(
        `  ✓ 6 scan events — Order 4: OUTBOUND + OUTBOUND_TRUCK_PHOTOS + ON_SITE_CAPTURE + DERIG_CAPTURE; ` +
            `Order 5: RETURN_TRUCK_PHOTOS + INBOUND-with-discrepancy`
    );
};
