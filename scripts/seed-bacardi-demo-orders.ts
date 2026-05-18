/**
 * Bacardi Demo Order Seeder — Creates 4 orders at DELIVERED, DERIG, CLOSED, and
 * PENDING_APPROVAL stages with full scan events, truck photos, status history,
 * pricing, and line items. Direct port of scripts/seed-demo-orders.ts (Red Bull
 * version) — only the tenant-identity constants + event names are different.
 *
 * Unlike the Red Bull script, this version DYNAMICALLY looks up the Bacardi
 * brand, warehouse, zone, city, logistics user, and assets at boot time. That
 * way it works on any DB that has Bacardi assets seeded without us having to
 * carry around a fresh batch of QR codes per environment.
 *
 * Run (staging):
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts \
 *     ./scripts/seed-bacardi-demo-orders.ts
 *
 * Preconditions on the target DB:
 *   • Bacardi company row exists (UUID hardcoded below).
 *   • At least one Bacardi-scoped brand.
 *   • At least one warehouse on the platform + one zone in that warehouse.
 *   • At least one CLIENT user with email gabouantou-staging@bacardi.com.
 *   • At least one LOGISTICS user on the platform.
 *   • At least 12 active Bacardi assets (orders need 3 each × 4 orders).
 */

import { db } from "../src/db";
import {
    orders,
    orderItems,
    orderStatusHistory,
    financialStatusHistory,
    scanEvents,
    scanEventAssets,
    scanEventMedia,
    lineItems,
    prices,
    assets,
    assetConditionHistory,
    brands,
    warehouses,
    zones,
    cities,
    users,
} from "../src/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

// ============================================================
// CONSTANTS — tenant identity
// ============================================================

const PLATFORM_ID = "852e6d14-cd3e-4a78-893b-b6ea7c91dead";
const BACARDI_COMPANY = "8da36306-052b-4e98-84e9-6ab09acdbb69";
const CLIENT_EMAIL = "gabouantou-staging@bacardi.com";

// Mockup truck/on-site/derig/return media (placehold.co — offline friendly)
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

function daysFromNow(n: number) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
}

function dateStr(d: Date) {
    return d.toISOString().split("T")[0];
}

function getAssetImageUrl(asset: { images?: unknown }): string {
    const imgs = (asset.images as Array<{ url?: string }> | undefined) || [];
    if (imgs.length > 0 && imgs[0]?.url) return imgs[0].url!;
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

async function insertStatusHistory(
    orderId: string,
    statuses: string[],
    baseTime: Date,
    logisticsUserId: string
) {
    for (let i = 0; i < statuses.length; i++) {
        await db.insert(orderStatusHistory).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId,
            status: statuses[i] as any,
            changed_at: new Date(baseTime.getTime() + i * 3600000),
            updated_by: logisticsUserId,
        });
    }
}

async function insertFinancialHistory(
    orderId: string,
    statuses: string[],
    baseTime: Date,
    logisticsUserId: string
) {
    for (let i = 0; i < statuses.length; i++) {
        await db.insert(financialStatusHistory).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId,
            status: statuses[i] as any,
            changed_at: new Date(baseTime.getTime() + i * 3600000),
            updated_by: logisticsUserId,
        });
    }
}

async function createScanEvent(
    orderId: string,
    assetId: string,
    scanType: string,
    condition: string,
    mediaUrls: Array<{ url: string; note?: string }>,
    quantity: number,
    timestamp: Date,
    logisticsUserId: string
) {
    const eventId = uuid();
    await db.insert(scanEvents).values({
        id: eventId,
        order_id: orderId,
        asset_id: assetId,
        scan_type: scanType as any,
        condition: condition as any,
        quantity,
        scanned_by: logisticsUserId,
        scanned_at: timestamp,
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
    console.log("=== Seeding Demo Orders for Bacardi ===\n");

    // ─── Resolve tenant prereqs ──────────────────────────────────
    const [bacardiBrand] = await db
        .select()
        .from(brands)
        .where(and(eq(brands.company_id, BACARDI_COMPANY), eq(brands.is_active, true)))
        .limit(1);
    if (!bacardiBrand) throw new Error("No Bacardi brand found");
    console.log(`  ✓ Brand: ${bacardiBrand.name} (${bacardiBrand.id})`);

    const [warehouse] = await db
        .select()
        .from(warehouses)
        .where(eq(warehouses.platform_id, PLATFORM_ID))
        .limit(1);
    if (!warehouse) throw new Error("No warehouse found on platform");
    console.log(`  ✓ Warehouse: ${warehouse.name} (${warehouse.id})`);

    const [zone] = await db
        .select()
        .from(zones)
        .where(eq(zones.warehouse_id, warehouse.id))
        .limit(1);
    if (!zone) throw new Error("No zone found in warehouse");
    console.log(`  ✓ Zone: ${zone.name} (${zone.id})`);

    // Dubai preferred; fall back to any city
    let [city] = await db
        .select()
        .from(cities)
        .where(sql`LOWER(${cities.name}) = 'dubai'`)
        .limit(1);
    if (!city) {
        [city] = await db.select().from(cities).limit(1);
    }
    if (!city) throw new Error("No city found");
    console.log(`  ✓ City: ${city.name} (${city.id})`);

    const [clientUser] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, CLIENT_EMAIL), eq(users.is_active, true)))
        .limit(1);
    if (!clientUser) throw new Error(`Client user ${CLIENT_EMAIL} not found`);
    console.log(`  ✓ Client: ${clientUser.name} (${clientUser.id})`);

    const [logisticsUser] = await db
        .select()
        .from(users)
        .where(
            and(
                eq(users.platform_id, PLATFORM_ID),
                eq(users.role, "LOGISTICS"),
                eq(users.is_active, true)
            )
        )
        .limit(1);
    if (!logisticsUser) throw new Error("No LOGISTICS user found on platform");
    const LOGISTICS_USER = logisticsUser.id;
    console.log(`  ✓ Logistics: ${logisticsUser.name} (${LOGISTICS_USER})`);

    // ─── Pick 12 Bacardi assets ──────────────────────────────────
    const bacardiAssets = await db
        .select()
        .from(assets)
        .where(and(eq(assets.company_id, BACARDI_COMPANY), isNull(assets.deleted_at)))
        .limit(12);
    if (bacardiAssets.length < 12) {
        throw new Error(
            `Need 12 Bacardi assets, found ${bacardiAssets.length}. Re-seed Bacardi assets first.`
        );
    }
    const [a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12] = bacardiAssets;
    console.log(`  ✓ Assets: ${bacardiAssets.length} selected\n`);

    // ================================================================
    // ORDER 1: DELIVERED — "Bacardi Carnival 2026"
    // ================================================================
    console.log("Creating Order 1: DELIVERED...");
    const orderId1 = uuid();
    const orderRef1 = await generateOrderId();
    const priceId1 = uuid();
    const eventStart1 = daysAgo(8);
    const eventEnd1 = daysAgo(6);

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

    await db.insert(orders).values({
        id: orderId1,
        platform_id: PLATFORM_ID,
        order_id: orderRef1,
        company_id: BACARDI_COMPANY,
        brand_id: bacardiBrand.id,
        created_by: clientUser.id,
        order_status: "DELIVERED",
        financial_status: "QUOTE_ACCEPTED",
        event_name: "Bacardi Carnival 2026",
        event_start_date: eventStart1,
        event_end_date: eventEnd1,
        venue_name: "Atlantis The Royal",
        venue_city_id: city.id,
        venue_address: "Palm Jumeirah, Dubai",
        venue_location: { lat: 25.1308, lng: 55.1175 },
        contact_name: "Guy Abou Antoun",
        contact_email: "gabouantou@bacardi.com",
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
        daysAgo(15),
        LOGISTICS_USER
    );
    await insertFinancialHistory(
        orderId1,
        ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED"],
        daysAgo(14),
        LOGISTICS_USER
    );

    for (const asset of [a1, a2, a3]) {
        await createScanEvent(
            orderId1,
            asset.id,
            "OUTBOUND",
            (asset.condition as string) || "GREEN",
            [{ url: getAssetImageUrl(asset), note: "Outbound scan — item loaded" }],
            1,
            daysAgo(9),
            LOGISTICS_USER
        );
    }

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
        daysAgo(9),
        LOGISTICS_USER
    );

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
    // ORDER 2: DERIG — "Bombay Sapphire Garden Soirée 2026"
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
        company_id: BACARDI_COMPANY,
        brand_id: bacardiBrand.id,
        created_by: clientUser.id,
        order_status: "DERIG",
        financial_status: "QUOTE_ACCEPTED",
        event_name: "Bombay Sapphire Garden Soirée 2026",
        event_start_date: eventStart2,
        event_end_date: eventEnd2,
        venue_name: "Address Downtown",
        venue_city_id: city.id,
        venue_address: "Sheikh Mohammed bin Rashid Blvd, Downtown Dubai",
        venue_location: { lat: 25.1934, lng: 55.2745 },
        contact_name: "Avukile Mabombo",
        contact_email: "amabombo@bacardi.com",
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
        daysAgo(18),
        LOGISTICS_USER
    );
    await insertFinancialHistory(
        orderId2,
        ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED"],
        daysAgo(17),
        LOGISTICS_USER
    );

    for (const asset of [a4, a5, a6]) {
        await createScanEvent(
            orderId2,
            asset.id,
            "OUTBOUND",
            (asset.condition as string) || "GREEN",
            [{ url: getAssetImageUrl(asset), note: "Outbound scan" }],
            1,
            daysAgo(12),
            LOGISTICS_USER
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
        daysAgo(12),
        LOGISTICS_USER
    );

    for (const asset of [a4, a5]) {
        await createScanEvent(
            orderId2,
            asset.id,
            "ON_SITE_CAPTURE",
            (asset.condition as string) || "GREEN",
            [
                { url: MOCK_ONSITE, note: `On-site evidence — ${asset.name}` },
                { url: getAssetImageUrl(asset), note: "Current state at venue" },
            ],
            1,
            daysAgo(10),
            LOGISTICS_USER
        );
    }

    for (const asset of [a4, a5, a6]) {
        await createScanEvent(
            orderId2,
            asset.id,
            "DERIG_CAPTURE",
            (asset.condition as string) || "GREEN",
            [
                { url: MOCK_DERIG, note: `Derigging ${asset.name}` },
                { url: getAssetImageUrl(asset), note: "Post-event condition" },
            ],
            1,
            daysAgo(9),
            LOGISTICS_USER
        );
    }

    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId2,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "ASSEMBLY",
        billing_mode: "BILLABLE",
        description: "Assembly & Rigging — Bar Setup",
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
        description: "Site Access Fee — Address Downtown",
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
    // ORDER 3: CLOSED — "Grey Goose Beach Club 2026"
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
        company_id: BACARDI_COMPANY,
        brand_id: bacardiBrand.id,
        created_by: clientUser.id,
        order_status: "CLOSED",
        financial_status: "PENDING_INVOICE",
        event_name: "Grey Goose Beach Club 2026",
        event_start_date: eventStart3,
        event_end_date: eventEnd3,
        venue_name: "Nikki Beach Resort",
        venue_city_id: city.id,
        venue_address: "Pearl Jumeirah, Dubai",
        venue_location: { lat: 25.2186, lng: 55.2363 },
        contact_name: "Elodie Barre",
        contact_email: "ebarre@bacardi.com",
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
        daysAgo(25),
        LOGISTICS_USER
    );
    await insertFinancialHistory(
        orderId3,
        ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED", "PENDING_INVOICE"],
        daysAgo(24),
        LOGISTICS_USER
    );

    for (const asset of [a7, a8, a9]) {
        await createScanEvent(
            orderId3,
            asset.id,
            "OUTBOUND",
            (asset.condition as string) || "GREEN",
            [{ url: getAssetImageUrl(asset), note: "Outbound scan" }],
            1,
            daysAgo(17),
            LOGISTICS_USER
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
        daysAgo(17),
        LOGISTICS_USER
    );

    for (const asset of [a7, a8, a9]) {
        await createScanEvent(
            orderId3,
            asset.id,
            "ON_SITE_CAPTURE",
            (asset.condition as string) || "GREEN",
            [{ url: MOCK_ONSITE, note: `On-site — ${asset.name}` }],
            1,
            daysAgo(15),
            LOGISTICS_USER
        );
        await createScanEvent(
            orderId3,
            asset.id,
            "DERIG_CAPTURE",
            (asset.condition as string) || "GREEN",
            [
                { url: MOCK_DERIG, note: `Derig — ${asset.name}` },
                { url: getAssetImageUrl(asset), note: "Post-event state" },
            ],
            1,
            daysAgo(14),
            LOGISTICS_USER
        );
    }

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
        daysAgo(13),
        LOGISTICS_USER
    );

    // Inbound — a7 GREEN
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
        daysAgo(13),
        LOGISTICS_USER
    );

    // a8 ORANGE — minor damage
    await createScanEvent(
        orderId3,
        a8.id,
        "INBOUND",
        "ORANGE",
        [
            { url: MOCK_RETURN1, note: "Return condition — minor scuffs" },
            { url: MOCK_RETURN2, note: "Damage on left side" },
        ],
        1,
        daysAgo(13),
        LOGISTICS_USER
    );

    await db.insert(assetConditionHistory).values({
        id: uuid(),
        platform_id: PLATFORM_ID,
        asset_id: a8.id,
        condition: "ORANGE",
        damage_report_entries: [
            { url: MOCK_RETURN2, description: "Minor scuffs on left side from event setup" },
        ],
        updated_by: LOGISTICS_USER,
        created_at: daysAgo(13),
    });

    // a9 GREEN
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
        daysAgo(13),
        LOGISTICS_USER
    );

    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId3,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "TRANSPORT",
        billing_mode: "BILLABLE",
        description: "Transport — Round Trip Pearl Jumeirah",
        quantity: 1,
        unit: "trip",
        unit_rate: "375",
        total: "375",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    console.log(
        `  ✓ ${orderRef3} — CLOSED — 3 assets, full lifecycle (outbound → return + 1 ORANGE)\n`
    );

    // ================================================================
    // ORDER 4: PENDING_APPROVAL — "Martini Asti Rooftop Launch 2026" (future)
    // ================================================================
    console.log("Creating Order 4: PENDING_APPROVAL...");
    const orderId4 = uuid();
    const orderRef4 = `ORD-${dateStr(new Date()).replace(/-/g, "")}-${String(parseInt(orderRef1.split("-")[2]) + 3).padStart(3, "0")}`;
    const priceId4 = uuid();
    const eventStart4 = daysFromNow(14);
    const eventEnd4 = daysFromNow(16);

    await db.insert(prices).values({
        id: priceId4,
        platform_id: PLATFORM_ID,
        entity_type: "ORDER",
        entity_id: orderId4,
        breakdown_lines: [
            {
                line_kind: "BASE_OPS",
                description: "Picking & Handling",
                buy_unit_price: 60,
                buy_total: 180,
                sell_unit_price: 75,
                sell_total: 225,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "RATE_CARD",
                description: "Rooftop Bar Installation (3 units)",
                buy_unit_price: 450,
                buy_total: 450,
                sell_unit_price: 560,
                sell_total: 560,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "RATE_CARD",
                description: "Transport — Round Trip",
                buy_unit_price: 400,
                buy_total: 400,
                sell_unit_price: 500,
                sell_total: 500,
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
        id: orderId4,
        platform_id: PLATFORM_ID,
        order_id: orderRef4,
        company_id: BACARDI_COMPANY,
        brand_id: bacardiBrand.id,
        created_by: clientUser.id,
        order_status: "PENDING_APPROVAL",
        financial_status: "QUOTE_SENT",
        event_name: "Martini Asti Rooftop Launch 2026",
        event_start_date: eventStart4,
        event_end_date: eventEnd4,
        venue_name: "SLS Dubai Rooftop",
        venue_city_id: city.id,
        venue_address: "Business Bay, Dubai",
        venue_location: { lat: 25.1856, lng: 55.2693 },
        contact_name: "Guy Abou Antoun",
        contact_email: "gabouantou@bacardi.com",
        contact_phone: "+971505551234",
        order_pricing_id: priceId4,
        delivery_window: { date: dateStr(daysFromNow(13)), time_from: "07:00", time_to: "11:00" },
        pickup_window: { date: dateStr(daysFromNow(17)), time_from: "14:00", time_to: "18:00" },
        calculated_totals: { total_volume: 4.5, total_weight: 240 },
        scanning_data: {
            outbound: { total: 3, scanned: 0, complete: false },
            inbound: { total: 3, scanned: 0, complete: false },
        },
        special_instructions:
            "Rooftop venue — service elevator required for setup. Pink champagne flutes pre-chilled day-of.",
        updated_at: new Date(),
    });

    for (const asset of [a10, a11, a12]) {
        await db.insert(orderItems).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId4,
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
        orderId4,
        ["SUBMITTED", "PRICING_REVIEW", "PENDING_APPROVAL"],
        daysAgo(2),
        LOGISTICS_USER
    );
    await insertFinancialHistory(
        orderId4,
        ["PENDING_QUOTE", "QUOTE_SENT"],
        daysAgo(2),
        LOGISTICS_USER
    );

    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId4,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "EQUIPMENT",
        billing_mode: "BILLABLE",
        description: "Rooftop Bar Installation — 3 units",
        quantity: 3,
        unit: "each",
        unit_rate: "560",
        total: "1680",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });
    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId4,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "TRANSPORT",
        billing_mode: "BILLABLE",
        description: "Transport — Business Bay Round Trip",
        quantity: 1,
        unit: "trip",
        unit_rate: "500",
        total: "500",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    console.log(`  ✓ ${orderRef4} — PENDING_APPROVAL — 3 assets, quote awaiting client approval\n`);

    console.log("=== Done! 4 Bacardi demo orders created ===");
    console.log(`  1. ${orderRef1} — DELIVERED — Bacardi Carnival 2026`);
    console.log(`  2. ${orderRef2} — DERIG — Bombay Sapphire Garden Soirée 2026`);
    console.log(`  3. ${orderRef3} — CLOSED — Grey Goose Beach Club 2026`);
    console.log(`  4. ${orderRef4} — PENDING_APPROVAL — Martini Asti Rooftop Launch 2026`);

    process.exit(0);
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
