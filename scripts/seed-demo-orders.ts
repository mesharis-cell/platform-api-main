/**
 * Demo Order Seeder — Creates 3 orders at DELIVERED, DERIG, CLOSED stages
 * with full scan events, truck photos, status history, and pricing.
 *
 * Run: cd api && bun run tsx scripts/seed-demo-orders.ts
 */

import { db } from "../src/db";
import {
    orders,
    orderItems,
    orderStatusHistory,
    financialStatusHistory,
    assetBookings,
    scanEvents,
    scanEventAssets,
    scanEventMedia,
    lineItems,
    prices,
    assets,
    assetConditionHistory,
} from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

// ============================================================
// CONSTANTS
// ============================================================

const PLATFORM_ID = "852e6d14-cd3e-4a78-893b-b6ea7c91dead";
const RB_COMPANY = "268a4d32-c07f-4281-99cc-e1647d0a2d84";
const RB_BRAND = "b5baaec2-b5aa-411f-90fd-d00edffbb455";
const WAREHOUSE_ID = "c34290d7-0526-4117-8446-33bc36295ab7";
const ZONE_ID = "e994352e-4429-4b92-bfe1-926040d5f0db";
const CITY_DUBAI = "e3413850-4fa6-402e-a7ca-ed36c6e88ce0";
const LOGISTICS_USER = "12a1e7fd-d580-4c58-aebf-0fdfc24fbd74";

const MOCK_TRUCK_OUT = "https://placehold.co/800x600/111827/fff?text=OUTBOUND+TRUCK+LOADING";
const MOCK_TRUCK_OUT2 = "https://placehold.co/800x600/111827/fff?text=OUTBOUND+TRUCK+SIDE+VIEW";
const MOCK_TRUCK_IN = "https://placehold.co/800x600/1e293b/fff?text=RETURN+TRUCK+ARRIVAL";
const MOCK_TRUCK_IN2 = "https://placehold.co/800x600/1e293b/fff?text=RETURN+TRUCK+UNLOADING";
const MOCK_ONSITE = "https://placehold.co/800x600/064e3b/fff?text=ON-SITE+EVIDENCE";
const MOCK_DERIG = "https://placehold.co/800x600/7c2d12/fff?text=DERIG+CAPTURE";
const MOCK_RETURN1 = "https://placehold.co/800x600/334155/fff?text=RETURN+CONDITION+WIDE+1";
const MOCK_RETURN2 = "https://placehold.co/800x600/334155/fff?text=RETURN+CONDITION+WIDE+2";

// ============================================================
// HELPERS
// ============================================================

function uuid() {
    return crypto.randomUUID();
}

function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

function dateStr(d: Date) {
    return d.toISOString().split("T")[0];
}

async function getAssetByQR(qr: string) {
    const [a] = await db.select().from(assets).where(eq(assets.qr_code, qr)).limit(1);
    if (!a) throw new Error(`Asset not found: ${qr}`);
    return a;
}

function getAssetImageUrl(asset: any): string {
    const imgs = asset.images || [];
    if (imgs.length > 0 && imgs[0]?.url) return imgs[0].url;
    return "https://placehold.co/400x400/1e293b/fff?text=NO+IMAGE";
}

async function generateOrderId() {
    const today = dateStr(new Date()).replace(/-/g, "");
    const [result] = await db
        .select({ order_id: orders.order_id })
        .from(orders)
        .where(sql`${orders.order_id} LIKE ${"ORD-" + today + "-%"}`)
        .orderBy(sql`${orders.order_id} DESC`)
        .limit(1);

    if (!result) return `ORD-${today}-001`;
    const seq = parseInt(result.order_id.split("-")[2]) + 1;
    return `ORD-${today}-${String(seq).padStart(3, "0")}`;
}

async function insertStatusHistory(orderId: string, statuses: string[], baseTime: Date) {
    for (let i = 0; i < statuses.length; i++) {
        await db.insert(orderStatusHistory).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId,
            status: statuses[i] as any,
            changed_at: new Date(baseTime.getTime() + i * 3600000),
            updated_by: LOGISTICS_USER,
        });
    }
}

async function insertFinancialHistory(orderId: string, statuses: string[], baseTime: Date) {
    for (let i = 0; i < statuses.length; i++) {
        await db.insert(financialStatusHistory).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId,
            status: statuses[i] as any,
            changed_at: new Date(baseTime.getTime() + i * 3600000),
            updated_by: LOGISTICS_USER,
        });
    }
}

async function createScanEvent(
    orderId: string,
    assetId: string,
    scanType: string,
    condition: string,
    mediaUrls: Array<{ url: string; note?: string }>,
    quantity: number = 1,
    timestamp?: Date
) {
    const eventId = uuid();
    await db.insert(scanEvents).values({
        id: eventId,
        order_id: orderId,
        asset_id: assetId,
        scan_type: scanType as any,
        condition: condition as any,
        quantity,
        scanned_by: LOGISTICS_USER,
        scanned_at: timestamp || new Date(),
        metadata: {},
    });

    await db.insert(scanEventAssets).values({
        id: uuid(),
        scan_event_id: eventId,
        asset_id: assetId,
        quantity,
    });

    for (let i = 0; i < mediaUrls.length; i++) {
        await db.insert(scanEventMedia).values({
            id: uuid(),
            scan_event_id: eventId,
            url: mediaUrls[i].url,
            note: mediaUrls[i].note || null,
            media_kind: "GENERAL",
            sort_order: i,
        });
    }

    return eventId;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log("=== Seeding Demo Orders for Red Bull ===\n");

    // Fetch assets
    const a1 = await getAssetByQR("ASSET-RED-20260313-9F7A48"); // Ice Breaker Multiplug
    const a2 = await getAssetByQR("ASSET-RED-20260313-E88207"); // 360 Small Cooler
    const a3 = await getAssetByQR("ASSET-RED-20260309-D416FA"); // Coolman Boxes #1
    const a4 = await getAssetByQR("ASSET-RED-20260309-5B9C43"); // Dipo Metal Stand #1
    const a5 = await getAssetByQR("ASSET-RED-20260309-E1C18B"); // Bull Seater Sofa
    const a6 = await getAssetByQR("ASSET-RED-20260309-276453"); // Coolman Boxes #6
    const a7 = await getAssetByQR("ASSET-RED-20260313-BE50A7"); // Polycarb Gin 72 Glasses
    const a8 = await getAssetByQR("ASSET-RED-20260313-33BBA8"); // Premium Paddle Seats #5
    const a9 = await getAssetByQR("ASSET-RED-20260309-8DA7BE"); // Coolman Boxes #7

    // ================================================================
    // ORDER 1: DELIVERED — "Red Bull Rooftop Sessions 2026"
    // ================================================================
    console.log("Creating Order 1: DELIVERED...");
    const orderId1 = uuid();
    const orderRef1 = await generateOrderId();
    const priceId1 = uuid();
    const eventStart1 = daysAgo(8);
    const eventEnd1 = daysAgo(6);

    // Pricing
    await db.insert(prices).values({
        id: priceId1,
        platform_id: PLATFORM_ID,
        entity_type: "ORDER",
        entity_id: orderId1,
        breakdown_lines: [
            {
                line_kind: "BASE_OPS",
                description: "Picking & Handling",
                buy_unit_price: 50,
                buy_total: 150,
                sell_unit_price: 62.5,
                sell_total: 187.5,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "RATE_CARD",
                description: "Equipment Setup",
                buy_unit_price: 200,
                buy_total: 200,
                sell_unit_price: 250,
                sell_total: 250,
                billing_mode: "BILLABLE",
            },
        ],
        margin_percent: "25",
        vat_percent: "5",
        created_by: LOGISTICS_USER,
        calculated_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    // Order
    await db.insert(orders).values({
        id: orderId1,
        platform_id: PLATFORM_ID,
        order_id: orderRef1,
        company_id: RB_COMPANY,
        brand_id: RB_BRAND,
        created_by: LOGISTICS_USER,
        order_status: "DELIVERED",
        financial_status: "QUOTE_ACCEPTED",
        event_name: "Red Bull Rooftop Sessions 2026",
        event_start_date: eventStart1,
        event_end_date: eventEnd1,
        venue_name: "Jumeirah Beach Hotel",
        venue_city_id: CITY_DUBAI,
        venue_address: "Jumeirah Road, Dubai",
        venue_location: { lat: 25.2048, lng: 55.2708 },
        contact_name: "Ahmad Khalil",
        contact_email: "ahmad@redbull.com",
        contact_phone: "+971501234567",
        order_pricing_id: priceId1,
        delivery_window: { date: dateStr(daysAgo(9)), time_from: "08:00", time_to: "12:00" },
        pickup_window: { date: dateStr(daysAgo(5)), time_from: "14:00", time_to: "18:00" },
        calculated_totals: { total_volume: 1.5, total_weight: 85 },
        scanning_data: {
            outbound: { total: 3, scanned: 3, complete: true },
            inbound: { total: 3, scanned: 0, complete: false },
        },
        updated_at: new Date(),
    });

    // Order items
    for (const asset of [a1, a2, a3]) {
        await db.insert(orderItems).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId1,
            asset_id: asset.id,
            asset_name: asset.name,
            quantity: 1,
            volume_per_unit: String(asset.volume_per_unit || 0),
            weight_per_unit: String(asset.weight_per_unit || 0),
            total_volume: String(asset.volume_per_unit || 0),
            total_weight: String(asset.weight_per_unit || 0),
        });
    }

    // Status + financial history
    await insertStatusHistory(
        orderId1,
        [
            "SUBMITTED",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
        ],
        daysAgo(15)
    );
    await insertFinancialHistory(
        orderId1,
        ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED"],
        daysAgo(14)
    );

    // Outbound scans
    for (const asset of [a1, a2, a3]) {
        await createScanEvent(
            orderId1,
            asset.id,
            "OUTBOUND",
            asset.condition,
            [{ url: getAssetImageUrl(asset), note: "Outbound scan — item loaded" }],
            1,
            daysAgo(9)
        );
    }

    // Outbound truck photos
    await createScanEvent(
        orderId1,
        a1.id,
        "OUTBOUND_TRUCK_PHOTOS",
        "GREEN",
        [
            { url: MOCK_TRUCK_OUT, note: "Truck loaded — front view" },
            { url: MOCK_TRUCK_OUT2, note: "Truck loaded — side view" },
        ],
        1,
        daysAgo(9)
    );

    // Line items
    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId1,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "EQUIPMENT",
        billing_mode: "BILLABLE",
        description: "Equipment Setup & Installation",
        quantity: 1,
        unit: "job",
        unit_rate: "250",
        total: "250",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    console.log(`  ✓ ${orderRef1} — DELIVERED — 3 assets, outbound scans + truck photos\n`);

    // ================================================================
    // ORDER 2: DERIG — "Red Bull Night Race Activation 2026"
    // ================================================================
    console.log("Creating Order 2: DERIG...");
    const orderId2 = uuid();
    const orderRef2 = `ORD-${dateStr(new Date()).replace(/-/g, "")}-${String(parseInt(orderRef1.split("-")[2]) + 1).padStart(3, "0")}`;
    const priceId2 = uuid();
    const eventStart2 = daysAgo(11);
    const eventEnd2 = daysAgo(9);

    await db.insert(prices).values({
        id: priceId2,
        platform_id: PLATFORM_ID,
        entity_type: "ORDER",
        entity_id: orderId2,
        breakdown_lines: [
            {
                line_kind: "BASE_OPS",
                description: "Picking & Handling",
                buy_total: 200,
                sell_total: 250,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "RATE_CARD",
                description: "Assembly & Rigging",
                buy_total: 350,
                sell_total: 437.5,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "CUSTOM",
                description: "Site Access Fee",
                buy_total: 100,
                sell_total: 125,
                billing_mode: "BILLABLE",
            },
        ],
        margin_percent: "25",
        vat_percent: "5",
        created_by: LOGISTICS_USER,
        calculated_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    await db.insert(orders).values({
        id: orderId2,
        platform_id: PLATFORM_ID,
        order_id: orderRef2,
        company_id: RB_COMPANY,
        brand_id: RB_BRAND,
        created_by: LOGISTICS_USER,
        order_status: "DERIG",
        financial_status: "QUOTE_ACCEPTED",
        event_name: "Red Bull Night Race Activation 2026",
        event_start_date: eventStart2,
        event_end_date: eventEnd2,
        venue_name: "Le Meridien Dubai",
        venue_city_id: CITY_DUBAI,
        venue_address: "Airport Road, Garhoud, Dubai",
        venue_location: { lat: 25.2532, lng: 55.3325 },
        contact_name: "Fatima Al Rashid",
        contact_email: "fatima@redbull.com",
        contact_phone: "+971507654321",
        order_pricing_id: priceId2,
        delivery_window: { date: dateStr(daysAgo(12)), time_from: "07:00", time_to: "11:00" },
        pickup_window: { date: dateStr(daysAgo(8)), time_from: "16:00", time_to: "20:00" },
        calculated_totals: { total_volume: 2.1, total_weight: 120 },
        scanning_data: {
            outbound: { total: 3, scanned: 3, complete: true },
            inbound: { total: 3, scanned: 0, complete: false },
        },
        updated_at: new Date(),
    });

    for (const asset of [a4, a5, a6]) {
        await db.insert(orderItems).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId2,
            asset_id: asset.id,
            asset_name: asset.name,
            quantity: 1,
            volume_per_unit: String(asset.volume_per_unit || 0),
            weight_per_unit: String(asset.weight_per_unit || 0),
            total_volume: String(asset.volume_per_unit || 0),
            total_weight: String(asset.weight_per_unit || 0),
        });
    }

    await insertStatusHistory(
        orderId2,
        [
            "SUBMITTED",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
            "IN_USE",
            "DERIG",
        ],
        daysAgo(18)
    );
    await insertFinancialHistory(
        orderId2,
        ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED"],
        daysAgo(17)
    );

    // Outbound scans
    for (const asset of [a4, a5, a6]) {
        await createScanEvent(
            orderId2,
            asset.id,
            "OUTBOUND",
            asset.condition,
            [{ url: getAssetImageUrl(asset), note: "Outbound scan" }],
            1,
            daysAgo(12)
        );
    }
    await createScanEvent(
        orderId2,
        a4.id,
        "OUTBOUND_TRUCK_PHOTOS",
        "GREEN",
        [
            { url: MOCK_TRUCK_OUT, note: "Truck loaded" },
            { url: MOCK_TRUCK_OUT2, note: "Side angle" },
        ],
        1,
        daysAgo(12)
    );

    // On-site capture
    for (const asset of [a4, a5]) {
        await createScanEvent(
            orderId2,
            asset.id,
            "ON_SITE_CAPTURE",
            asset.condition,
            [
                { url: MOCK_ONSITE, note: `On-site evidence — ${asset.name}` },
                { url: getAssetImageUrl(asset), note: "Current state at venue" },
            ],
            1,
            daysAgo(10)
        );
    }

    // Derig capture
    for (const asset of [a4, a5, a6]) {
        await createScanEvent(
            orderId2,
            asset.id,
            "DERIG_CAPTURE",
            asset.condition,
            [
                { url: MOCK_DERIG, note: `Derigging ${asset.name}` },
                { url: getAssetImageUrl(asset), note: "Post-event condition" },
            ],
            1,
            daysAgo(9)
        );
    }

    // Line items
    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId2,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "ASSEMBLY",
        billing_mode: "BILLABLE",
        description: "Assembly & Rigging — Metal Stand + Sofa Setup",
        quantity: 1,
        unit: "job",
        unit_rate: "437.50",
        total: "437.50",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });
    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId2,
        purpose_type: "ORDER",
        line_item_type: "CUSTOM",
        category: "OTHER",
        billing_mode: "BILLABLE",
        description: "Site Access Fee — Le Meridien",
        quantity: 1,
        unit: "flat",
        unit_rate: "125",
        total: "125",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    console.log(`  ✓ ${orderRef2} — DERIG — 3 assets, outbound + on-site + derig captures\n`);

    // ================================================================
    // ORDER 3: CLOSED — "Red Bull Sound Clash 2026"
    // ================================================================
    console.log("Creating Order 3: CLOSED...");
    const orderId3 = uuid();
    const orderRef3 = `ORD-${dateStr(new Date()).replace(/-/g, "")}-${String(parseInt(orderRef1.split("-")[2]) + 2).padStart(3, "0")}`;
    const priceId3 = uuid();
    const eventStart3 = daysAgo(16);
    const eventEnd3 = daysAgo(14);

    await db.insert(prices).values({
        id: priceId3,
        platform_id: PLATFORM_ID,
        entity_type: "ORDER",
        entity_id: orderId3,
        breakdown_lines: [
            {
                line_kind: "BASE_OPS",
                description: "Picking & Handling",
                buy_total: 180,
                sell_total: 225,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "RATE_CARD",
                description: "Transport — Round Trip",
                buy_total: 300,
                sell_total: 375,
                billing_mode: "BILLABLE",
            },
        ],
        margin_percent: "25",
        vat_percent: "5",
        created_by: LOGISTICS_USER,
        calculated_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    await db.insert(orders).values({
        id: orderId3,
        platform_id: PLATFORM_ID,
        order_id: orderRef3,
        company_id: RB_COMPANY,
        brand_id: RB_BRAND,
        created_by: LOGISTICS_USER,
        order_status: "CLOSED",
        financial_status: "PENDING_INVOICE",
        event_name: "Red Bull Sound Clash 2026",
        event_start_date: eventStart3,
        event_end_date: eventEnd3,
        venue_name: "Caesars Palace Bluewaters",
        venue_city_id: CITY_DUBAI,
        venue_address: "Bluewaters Island, Dubai",
        venue_location: { lat: 25.0784, lng: 55.1186 },
        contact_name: "Omar Hassan",
        contact_email: "omar@redbull.com",
        contact_phone: "+971509876543",
        order_pricing_id: priceId3,
        delivery_window: { date: dateStr(daysAgo(17)), time_from: "06:00", time_to: "10:00" },
        pickup_window: { date: dateStr(daysAgo(13)), time_from: "15:00", time_to: "19:00" },
        calculated_totals: { total_volume: 1.8, total_weight: 95 },
        scanning_data: {
            outbound: { total: 3, scanned: 3, complete: true },
            inbound: { total: 3, scanned: 3, complete: true },
        },
        updated_at: new Date(),
    });

    for (const asset of [a7, a8, a9]) {
        await db.insert(orderItems).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId3,
            asset_id: asset.id,
            asset_name: asset.name,
            quantity: 1,
            volume_per_unit: String(asset.volume_per_unit || 0),
            weight_per_unit: String(asset.weight_per_unit || 0),
            total_volume: String(asset.volume_per_unit || 0),
            total_weight: String(asset.weight_per_unit || 0),
        });
    }

    await insertStatusHistory(
        orderId3,
        [
            "SUBMITTED",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
            "IN_USE",
            "DERIG",
            "AWAITING_RETURN",
            "RETURN_IN_TRANSIT",
            "CLOSED",
        ],
        daysAgo(25)
    );
    await insertFinancialHistory(
        orderId3,
        ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED", "PENDING_INVOICE"],
        daysAgo(24)
    );

    // Outbound scans
    for (const asset of [a7, a8, a9]) {
        await createScanEvent(
            orderId3,
            asset.id,
            "OUTBOUND",
            asset.condition,
            [{ url: getAssetImageUrl(asset), note: "Outbound scan" }],
            1,
            daysAgo(17)
        );
    }
    await createScanEvent(
        orderId3,
        a7.id,
        "OUTBOUND_TRUCK_PHOTOS",
        "GREEN",
        [
            { url: MOCK_TRUCK_OUT, note: "Outbound truck" },
            { url: MOCK_TRUCK_OUT2, note: "Loading complete" },
        ],
        1,
        daysAgo(17)
    );

    // On-site + derig
    for (const asset of [a7, a8, a9]) {
        await createScanEvent(
            orderId3,
            asset.id,
            "ON_SITE_CAPTURE",
            asset.condition,
            [{ url: MOCK_ONSITE, note: `On-site — ${asset.name}` }],
            1,
            daysAgo(15)
        );
        await createScanEvent(
            orderId3,
            asset.id,
            "DERIG_CAPTURE",
            asset.condition,
            [
                { url: MOCK_DERIG, note: `Derig — ${asset.name}` },
                { url: getAssetImageUrl(asset), note: "Post-event state" },
            ],
            1,
            daysAgo(14)
        );
    }

    // Return truck photos
    await createScanEvent(
        orderId3,
        a7.id,
        "RETURN_TRUCK_PHOTOS",
        "GREEN",
        [
            { url: MOCK_TRUCK_IN, note: "Return truck arrival" },
            { url: MOCK_TRUCK_IN2, note: "Unloading at warehouse" },
        ],
        1,
        daysAgo(13)
    );

    // Inbound scans — with condition assessments
    // a7 (Polycarb Gin Glasses) returns GREEN
    await createScanEvent(
        orderId3,
        a7.id,
        "INBOUND",
        "GREEN",
        [
            { url: MOCK_RETURN1, note: "Return condition — good" },
            { url: MOCK_RETURN2, note: "Wide angle — no damage" },
        ],
        1,
        daysAgo(13)
    );

    // a8 (Premium Paddle Seats) returns ORANGE — damage
    await createScanEvent(
        orderId3,
        a8.id,
        "INBOUND",
        "ORANGE",
        [
            { url: MOCK_RETURN1, note: "Return condition — minor scuffs" },
            { url: MOCK_RETURN2, note: "Damage on left armrest" },
        ],
        1,
        daysAgo(13)
    );

    // Update a8 condition to ORANGE with notes
    await db.insert(assetConditionHistory).values({
        id: uuid(),
        platform_id: PLATFORM_ID,
        asset_id: a8.id,
        condition: "ORANGE",
        damage_report_entries: [
            { url: MOCK_RETURN2, description: "Minor scuffs on left armrest from event setup" },
        ],
        updated_by: LOGISTICS_USER,
        created_at: daysAgo(13),
    });

    // a9 (Coolman Boxes #7) returns GREEN
    await createScanEvent(
        orderId3,
        a9.id,
        "INBOUND",
        "GREEN",
        [
            { url: MOCK_RETURN1, note: "Return condition — good" },
            { url: MOCK_RETURN2, note: "No damage" },
        ],
        1,
        daysAgo(13)
    );

    // Line items
    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId3,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "TRANSPORT",
        billing_mode: "BILLABLE",
        description: "Transport — Round Trip Bluewaters Island",
        quantity: 1,
        unit: "trip",
        unit_rate: "375",
        total: "375",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    console.log(
        `  ✓ ${orderRef3} — CLOSED — 3 assets, full lifecycle with inbound scans + condition reports\n`
    );

    console.log("=== Done! 3 demo orders created ===");
    console.log(`  1. ${orderRef1} — DELIVERED`);
    console.log(`  2. ${orderRef2} — DERIG`);
    console.log(`  3. ${orderRef3} — CLOSED`);

    process.exit(0);
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
