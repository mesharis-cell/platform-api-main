/**
 * Bacardi — add ONE extra PENDING_APPROVAL order on top of whatever's already
 * in staging. Mirrors Order 4 from seed-bacardi-demo-orders.ts with different
 * event name / venue / contact / assets.
 *
 * Run (staging):
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts \
 *     ./scripts/seed-bacardi-extra-pending.ts
 */

import { db } from "../src/db";
import {
    orders,
    orderItems,
    orderStatusHistory,
    financialStatusHistory,
    lineItems,
    prices,
    assets,
    brands,
    cities,
    users,
} from "../src/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

const PLATFORM_ID = "852e6d14-cd3e-4a78-893b-b6ea7c91dead";
const BACARDI_COMPANY = "8da36306-052b-4e98-84e9-6ab09acdbb69";
const CLIENT_EMAIL = "gabouantou-staging@bacardi.com";

const uuid = () => crypto.randomUUID();
const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
};
const daysFromNow = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
};
const dateStr = (d: Date) => d.toISOString().split("T")[0];

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

async function main() {
    console.log("=== Adding 1 extra Bacardi PENDING_APPROVAL order ===\n");

    const [bacardiBrand] = await db
        .select()
        .from(brands)
        .where(and(eq(brands.company_id, BACARDI_COMPANY), eq(brands.is_active, true)))
        .limit(1);
    if (!bacardiBrand) throw new Error("No Bacardi brand found");

    let [city] = await db
        .select()
        .from(cities)
        .where(sql`LOWER(${cities.name}) = 'dubai'`)
        .limit(1);
    if (!city) [city] = await db.select().from(cities).limit(1);
    if (!city) throw new Error("No city found");

    const [clientUser] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, CLIENT_EMAIL), eq(users.is_active, true)))
        .limit(1);
    if (!clientUser) throw new Error(`Client user ${CLIENT_EMAIL} not found`);

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
    if (!logisticsUser) throw new Error("No LOGISTICS user found");
    const LOGISTICS_USER = logisticsUser.id;

    // Grab 3 Bacardi assets (different slice from the first seed — offset 12)
    const bacardiAssets = await db
        .select()
        .from(assets)
        .where(and(eq(assets.company_id, BACARDI_COMPANY), isNull(assets.deleted_at)))
        .limit(20);
    const pool = bacardiAssets.slice(12, 15).length === 3 ? bacardiAssets.slice(12, 15) : bacardiAssets.slice(0, 3);
    const [a1, a2, a3] = pool;
    if (!a1 || !a2 || !a3) throw new Error("Need ≥3 Bacardi assets");

    const orderId = uuid();
    const orderRef = await generateOrderId();
    const priceId = uuid();
    const eventStart = daysFromNow(21);
    const eventEnd = daysFromNow(23);

    await db.insert(prices).values({
        id: priceId,
        platform_id: PLATFORM_ID,
        entity_type: "ORDER",
        entity_id: orderId,
        breakdown_lines: [
            {
                line_kind: "BASE_OPS",
                description: "Picking & Handling",
                buy_unit_price: 55,
                buy_total: 165,
                sell_unit_price: 68.75,
                sell_total: 206.25,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "RATE_CARD",
                description: "Beach Bar Installation (3 units)",
                buy_unit_price: 380,
                buy_total: 380,
                sell_unit_price: 475,
                sell_total: 475,
                billing_mode: "BILLABLE",
            },
            {
                line_kind: "RATE_CARD",
                description: "Transport — One Way (Beach Setup)",
                buy_unit_price: 220,
                buy_total: 220,
                sell_unit_price: 275,
                sell_total: 275,
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
        id: orderId,
        platform_id: PLATFORM_ID,
        order_id: orderRef,
        company_id: BACARDI_COMPANY,
        brand_id: bacardiBrand.id,
        created_by: clientUser.id,
        order_status: "PENDING_APPROVAL",
        financial_status: "QUOTE_SENT",
        event_name: "Patron Tequila Sunset Sessions 2026",
        event_start_date: eventStart,
        event_end_date: eventEnd,
        venue_name: "Zero Gravity Beach Club",
        venue_city_id: city.id,
        venue_address: "Skydive Dubai Drop Zone, Al Sufouh",
        venue_location: { lat: 25.0959, lng: 55.1393 },
        contact_name: "Avukile Mabombo",
        contact_email: "amabombo@bacardi.com",
        contact_phone: "+971504448822",
        order_pricing_id: priceId,
        delivery_window: { date: dateStr(daysFromNow(20)), time_from: "06:00", time_to: "10:00" },
        pickup_window: { date: dateStr(daysFromNow(24)), time_from: "15:00", time_to: "19:00" },
        calculated_totals: { total_volume: 3.2, total_weight: 175 },
        scanning_data: {
            outbound: { total: 3, scanned: 0, complete: false },
            inbound: { total: 3, scanned: 0, complete: false },
        },
        special_instructions:
            "Beachside venue — sand-resistant covers required for all bar units. Sunset call-time 17:30.",
        updated_at: new Date(),
    });

    for (const asset of [a1, a2, a3]) {
        await db.insert(orderItems).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId,
            asset_id: asset.id,
            asset_name: asset.name,
            quantity: 1,
            volume_per_unit: String(asset.volume_per_unit || 0),
            weight_per_unit: String(asset.weight_per_unit || 0),
            total_volume: String(asset.volume_per_unit || 0),
            total_weight: String(asset.weight_per_unit || 0),
        });
    }

    for (let i = 0; i < 3; i++) {
        const status = ["SUBMITTED", "PRICING_REVIEW", "PENDING_APPROVAL"][i];
        await db.insert(orderStatusHistory).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId,
            status: status as any,
            changed_at: new Date(daysAgo(1).getTime() + i * 3600000),
            updated_by: LOGISTICS_USER,
        });
    }
    for (let i = 0; i < 2; i++) {
        const status = ["PENDING_QUOTE", "QUOTE_SENT"][i];
        await db.insert(financialStatusHistory).values({
            id: uuid(),
            platform_id: PLATFORM_ID,
            order_id: orderId,
            status: status as any,
            changed_at: new Date(daysAgo(1).getTime() + i * 3600000),
            updated_by: LOGISTICS_USER,
        });
    }

    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "EQUIPMENT",
        billing_mode: "BILLABLE",
        description: "Beach Bar Installation — 3 units",
        quantity: 3,
        unit: "each",
        unit_rate: "475",
        total: "1425",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });
    await db.insert(lineItems).values({
        id: uuid(),
        line_item_id: `LI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        platform_id: PLATFORM_ID,
        order_id: orderId,
        purpose_type: "ORDER",
        line_item_type: "CATALOG",
        category: "TRANSPORT",
        billing_mode: "BILLABLE",
        description: "Transport — One Way Beachside",
        quantity: 1,
        unit: "trip",
        unit_rate: "275",
        total: "275",
        added_by: LOGISTICS_USER,
        created_by: LOGISTICS_USER,
        updated_at: new Date(),
    });

    console.log(
        `✓ ${orderRef} — PENDING_APPROVAL — Patron Tequila Sunset Sessions 2026 — 3 assets\n`
    );

    process.exit(0);
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
