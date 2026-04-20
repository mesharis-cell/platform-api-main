/**
 * Six demo orders spanning the lifecycle (SUBMITTED → CANCELLED), all
 * belonging to the docs CLIENT user (Alex Chen). Direct DB inserts — no
 * API calls, no event emission — so reseeding is fast and silent.
 *
 * Pricing uses the real PricingService.rebuildBreakdown after inserting
 * CATALOG line items, so the resulting `prices` rows match production shape
 * (BASE_OPS auto-synced as a SYSTEM line, breakdown_lines populated, totals
 * computed). That means the docs UI renders these orders identically to
 * orders created through the real flow.
 *
 * Status histories walk the full path each order took to reach its final
 * state so the timeline UI has rich content. Bookings are inserted for
 * CONFIRMED + DELIVERED orders and released for CLOSED, mirroring production
 * lifecycle invariants.
 */

import { and, eq, sql } from "drizzle-orm";
import { lineItemIdGenerator } from "../../app/modules/order-line-items/order-line-items.utils";
import { PREP_BUFFER_DAYS, RETURN_BUFFER_DAYS } from "../../app/modules/order/order.utils";
import { PricingService } from "../../app/services/pricing.service";
import { db } from "../index";
import * as schema from "../schema";
import { DEMO_EPOCH, DEMO_ORDER_IDS, DEMO_UUIDS, daysFromEpoch } from "./demo-deterministic";

type FinancialStatus =
    | "PENDING_QUOTE"
    | "QUOTE_SENT"
    | "QUOTE_REVISED"
    | "QUOTE_ACCEPTED"
    | "PENDING_INVOICE"
    | "INVOICED"
    | "PAID"
    | "CANCELLED";

type OrderStatus =
    | "DRAFT"
    | "SUBMITTED"
    | "PRICING_REVIEW"
    | "PENDING_APPROVAL"
    | "QUOTED"
    | "DECLINED"
    | "CONFIRMED"
    | "IN_PREPARATION"
    | "READY_FOR_DELIVERY"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "IN_USE"
    | "DERIG"
    | "AWAITING_RETURN"
    | "RETURN_IN_TRANSIT"
    | "CLOSED"
    | "CANCELLED";

export type SeedDemoOrdersOpts = {
    platformId: string;
    companyId: string;
    brandId: string;
    cityId: string;
    countryName: string;
    cityName: string;
    clientUserId: string;
    adminUserId: string;
    logisticsUserId: string;
    /** GREEN POOLED asset (Event Chairs batch). */
    pooledAsset: { id: string; name: string; weightPerUnit: string; volumePerUnit: string };
    /** First GREEN INDIVIDUAL Backdrop. */
    backdropAsset: { id: string; name: string; weightPerUnit: string; volumePerUnit: string };
    /** First GREEN INDIVIDUAL LED Screen. */
    ledAsset: { id: string; name: string; weightPerUnit: string; volumePerUnit: string };
};

export type SeededOrders = {
    order1Submitted: { id: string; orderId: string };
    order2Quoted: { id: string; orderId: string };
    order3Confirmed: { id: string; orderId: string };
    order4Delivered: { id: string; orderId: string };
    order5Closed: { id: string; orderId: string };
    order6Cancelled: { id: string; orderId: string };
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

type OrderItemSpec = {
    asset: { id: string; name: string; weightPerUnit: string; volumePerUnit: string };
    quantity: number;
};

type CatalogLineSpec = {
    serviceCategory: "ASSEMBLY" | "EQUIPMENT" | "HANDLING" | "RESKIN" | "TRANSPORT" | "OTHER";
    serviceNamePattern: string;
    quantity: number;
};

type StatusStep = { status: OrderStatus; daysFromEpoch: number; notes?: string };
type FinancialStep = { status: FinancialStatus; daysFromEpoch: number; notes?: string };

const computeOrderTotals = (items: OrderItemSpec[]) => {
    let totalVolume = 0;
    let totalWeight = 0;
    for (const item of items) {
        totalVolume += parseFloat(item.asset.volumePerUnit) * item.quantity;
        totalWeight += parseFloat(item.asset.weightPerUnit) * item.quantity;
    }
    return {
        volume: Number(totalVolume.toFixed(3)),
        weight: Number(totalWeight.toFixed(2)),
    };
};

/**
 * Inserts an empty placeholder `prices` row whose entity_id matches the order
 * we're about to create. Returns the prices.id so the order INSERT can FK to it.
 * After line items are seeded, `rebuildBreakdown` updates this row in place
 * (see prices_platform_entity_unique constraint — only one prices row per entity).
 */
const insertPlaceholderPrices = async (opts: {
    platformId: string;
    orderUuid: string;
    calculatedBy: string;
}): Promise<string> => {
    const [row] = await db
        .insert(schema.prices)
        .values({
            platform_id: opts.platformId,
            entity_type: "ORDER",
            entity_id: opts.orderUuid,
            breakdown_lines: [],
            margin_percent: "25.00",
            vat_percent: "0.00",
            calculated_by: opts.calculatedBy,
        })
        .returning({ id: schema.prices.id });
    return row.id;
};

const insertOrderRow = async (opts: {
    orderUuid: string;
    publicOrderId: string;
    platformId: string;
    companyId: string;
    brandId: string;
    cityId: string;
    countryName: string;
    cityName: string;
    clientUserId: string;
    eventStartDays: number;
    eventEndDays: number;
    venueName: string;
    pricesId: string;
    orderStatus: OrderStatus;
    financialStatus: FinancialStatus;
    poNumber?: string | null;
    items: OrderItemSpec[];
    specialInstructions?: string | null;
}) => {
    const totals = computeOrderTotals(opts.items);
    await db.insert(schema.orders).values({
        id: opts.orderUuid,
        platform_id: opts.platformId,
        order_id: opts.publicOrderId,
        company_id: opts.companyId,
        brand_id: opts.brandId,
        created_by: opts.clientUserId,
        po_number: opts.poNumber ?? null,
        contact_name: "Alex Chen",
        contact_email: "alex.chen@kadence-demo.com",
        contact_phone: "+971-50-555-0100",
        event_start_date: daysFromEpoch(opts.eventStartDays),
        event_end_date: daysFromEpoch(opts.eventEndDays),
        venue_name: opts.venueName,
        venue_city_id: opts.cityId,
        venue_location: {
            country: opts.countryName,
            city: opts.cityName,
            address: `${opts.venueName}, ${opts.cityName}, ${opts.countryName}`,
            access_notes: null,
        },
        special_instructions: opts.specialInstructions ?? null,
        calculated_totals: totals,
        order_pricing_id: opts.pricesId,
        order_status: opts.orderStatus,
        financial_status: opts.financialStatus,
    });
};

const insertOrderItems = async (
    platformId: string,
    orderUuid: string,
    items: OrderItemSpec[]
): Promise<void> => {
    if (items.length === 0) return;
    await db.insert(schema.orderItems).values(
        items.map((it) => ({
            platform_id: platformId,
            order_id: orderUuid,
            asset_id: it.asset.id,
            asset_name: it.asset.name,
            quantity: it.quantity,
            volume_per_unit: it.asset.volumePerUnit,
            weight_per_unit: it.asset.weightPerUnit,
            total_volume: (parseFloat(it.asset.volumePerUnit) * it.quantity).toFixed(3),
            total_weight: (parseFloat(it.asset.weightPerUnit) * it.quantity).toFixed(2),
        }))
    );
};

const insertStatusHistory = async (
    platformId: string,
    orderUuid: string,
    updatedBy: string,
    steps: StatusStep[]
): Promise<void> => {
    if (steps.length === 0) return;
    await db.insert(schema.orderStatusHistory).values(
        steps.map((s) => ({
            platform_id: platformId,
            order_id: orderUuid,
            status: s.status,
            notes: s.notes ?? null,
            updated_by: updatedBy,
            timestamp: daysFromEpoch(s.daysFromEpoch),
        }))
    );
};

const insertFinancialHistory = async (
    platformId: string,
    orderUuid: string,
    updatedBy: string,
    steps: FinancialStep[]
): Promise<void> => {
    if (steps.length === 0) return;
    await db.insert(schema.financialStatusHistory).values(
        steps.map((s) => ({
            platform_id: platformId,
            order_id: orderUuid,
            status: s.status,
            notes: s.notes ?? null,
            updated_by: updatedBy,
            timestamp: daysFromEpoch(s.daysFromEpoch),
        }))
    );
};

const findServiceTypeId = async (
    platformId: string,
    category: CatalogLineSpec["serviceCategory"],
    namePattern: string
): Promise<{ id: string; unit: string; defaultRate: string; name: string }> => {
    const all = await db
        .select({
            id: schema.serviceTypes.id,
            unit: schema.serviceTypes.unit,
            defaultRate: schema.serviceTypes.default_rate,
            name: schema.serviceTypes.name,
        })
        .from(schema.serviceTypes)
        .where(
            and(
                eq(schema.serviceTypes.platform_id, platformId),
                eq(schema.serviceTypes.category, category)
            )
        );
    if (all.length === 0) throw new Error(`No service type found in category ${category}`);
    const match =
        all.find((s) => s.name.toLowerCase().includes(namePattern.toLowerCase())) ?? all[0];
    if (match.defaultRate === null) {
        throw new Error(`Service type ${match.name} has null default_rate — needed for line item.`);
    }
    return {
        id: match.id,
        unit: match.unit,
        defaultRate: match.defaultRate,
        name: match.name,
    };
};

const insertCatalogLineItems = async (opts: {
    platformId: string;
    orderUuid: string;
    addedBy: string;
    lines: CatalogLineSpec[];
}): Promise<void> => {
    for (const line of opts.lines) {
        const svc = await findServiceTypeId(
            opts.platformId,
            line.serviceCategory,
            line.serviceNamePattern
        );
        const lineItemPublicId = await lineItemIdGenerator(opts.platformId);
        const total = (parseFloat(svc.defaultRate) * line.quantity).toFixed(2);
        await db.insert(schema.lineItems).values({
            line_item_id: lineItemPublicId,
            platform_id: opts.platformId,
            order_id: opts.orderUuid,
            purpose_type: "ORDER",
            service_type_id: svc.id,
            line_item_type: "CATALOG",
            billing_mode: "BILLABLE",
            category: line.serviceCategory,
            description: svc.name,
            quantity: line.quantity.toString(),
            unit: svc.unit,
            unit_rate: svc.defaultRate,
            total,
            added_by: opts.addedBy,
            client_price_visible: true,
        });
    }
};

const rebuildPricing = async (opts: {
    platformId: string;
    orderUuid: string;
    calculatedBy: string;
}): Promise<void> => {
    await PricingService.rebuildBreakdown({
        entity_type: "ORDER",
        entity_id: opts.orderUuid,
        platform_id: opts.platformId,
        calculated_by: opts.calculatedBy,
    });
};

const insertBookings = async (opts: {
    orderUuid: string;
    items: OrderItemSpec[];
    eventStartDays: number;
    eventEndDays: number;
}): Promise<void> => {
    if (opts.items.length === 0) return;
    const blockedFrom = daysFromEpoch(opts.eventStartDays - PREP_BUFFER_DAYS);
    const blockedUntil = daysFromEpoch(opts.eventEndDays + RETURN_BUFFER_DAYS);
    await db.insert(schema.assetBookings).values(
        opts.items.map((it) => ({
            asset_id: it.asset.id,
            order_id: opts.orderUuid,
            quantity: it.quantity,
            blocked_from: blockedFrom,
            blocked_until: blockedUntil,
        }))
    );
    for (const it of opts.items) {
        await db
            .update(schema.assets)
            .set({
                available_quantity: sql`${schema.assets.available_quantity} - ${it.quantity}`,
            })
            .where(eq(schema.assets.id, it.asset.id));
    }
};

// ─────────────────────────────────────────────────────────────
// Per-order seed functions
// ─────────────────────────────────────────────────────────────

const seedOrder1Submitted = async (opts: SeedDemoOrdersOpts) => {
    const orderUuid = DEMO_UUIDS.orders.order1Submitted;
    const items: OrderItemSpec[] = [{ asset: opts.pooledAsset, quantity: 5 }];
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertOrderRow({
        orderUuid,
        publicOrderId: DEMO_ORDER_IDS.order1Submitted,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        cityId: opts.cityId,
        countryName: opts.countryName,
        cityName: opts.cityName,
        clientUserId: opts.clientUserId,
        eventStartDays: 14,
        eventEndDays: 16,
        venueName: "Madinat Jumeirah Conference Centre",
        pricesId,
        orderStatus: "PRICING_REVIEW",
        financialStatus: "PENDING_QUOTE",
        items,
        specialInstructions: "Setup must be complete by 4pm the day before event.",
    });
    await insertOrderItems(opts.platformId, orderUuid, items);
    await insertStatusHistory(opts.platformId, orderUuid, opts.clientUserId, [
        { status: "DRAFT", daysFromEpoch: 0 },
        { status: "SUBMITTED", daysFromEpoch: 0, notes: "Submitted from cart by Alex Chen." },
        {
            status: "PRICING_REVIEW",
            daysFromEpoch: 0,
            notes: "Auto-transition for logistics review.",
        },
    ]);
    await insertFinancialHistory(opts.platformId, orderUuid, opts.clientUserId, [
        { status: "PENDING_QUOTE", daysFromEpoch: 0 },
    ]);
};

const seedOrder2Quoted = async (opts: SeedDemoOrdersOpts) => {
    const orderUuid = DEMO_UUIDS.orders.order2Quoted;
    const items: OrderItemSpec[] = [
        { asset: opts.pooledAsset, quantity: 10 },
        { asset: opts.backdropAsset, quantity: 1 },
    ];
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertOrderRow({
        orderUuid,
        publicOrderId: DEMO_ORDER_IDS.order2Quoted,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        cityId: opts.cityId,
        countryName: opts.countryName,
        cityName: opts.cityName,
        clientUserId: opts.clientUserId,
        eventStartDays: 21,
        eventEndDays: 23,
        venueName: "Atlantis The Palm",
        pricesId,
        orderStatus: "QUOTED",
        financialStatus: "QUOTE_SENT",
        items,
    });
    await insertOrderItems(opts.platformId, orderUuid, items);
    await insertCatalogLineItems({
        platformId: opts.platformId,
        orderUuid,
        addedBy: opts.logisticsUserId,
        lines: [
            { serviceCategory: "ASSEMBLY", serviceNamePattern: "Basic Assembly", quantity: 2 },
            { serviceCategory: "HANDLING", serviceNamePattern: "Loading", quantity: 3 },
        ],
    });
    await rebuildPricing({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertStatusHistory(opts.platformId, orderUuid, opts.adminUserId, [
        { status: "DRAFT", daysFromEpoch: -3 },
        { status: "SUBMITTED", daysFromEpoch: -3 },
        { status: "PRICING_REVIEW", daysFromEpoch: -3 },
        {
            status: "PENDING_APPROVAL",
            daysFromEpoch: -2,
            notes: "Logistics submitted pricing for admin review.",
        },
        { status: "QUOTED", daysFromEpoch: -1, notes: "Admin approved quote and sent to client." },
    ]);
    await insertFinancialHistory(opts.platformId, orderUuid, opts.adminUserId, [
        { status: "PENDING_QUOTE", daysFromEpoch: -3 },
        { status: "QUOTE_SENT", daysFromEpoch: -1 },
    ]);
};

const seedOrder3Confirmed = async (opts: SeedDemoOrdersOpts) => {
    const orderUuid = DEMO_UUIDS.orders.order3Confirmed;
    const items: OrderItemSpec[] = [{ asset: opts.pooledAsset, quantity: 5 }];
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertOrderRow({
        orderUuid,
        publicOrderId: DEMO_ORDER_IDS.order3Confirmed,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        cityId: opts.cityId,
        countryName: opts.countryName,
        cityName: opts.cityName,
        clientUserId: opts.clientUserId,
        eventStartDays: 7,
        eventEndDays: 9,
        venueName: "DIFC Gate Village",
        pricesId,
        orderStatus: "CONFIRMED",
        financialStatus: "QUOTE_ACCEPTED",
        poNumber: "PO-DEMO-0003",
        items,
    });
    await insertOrderItems(opts.platformId, orderUuid, items);
    await insertCatalogLineItems({
        platformId: opts.platformId,
        orderUuid,
        addedBy: opts.logisticsUserId,
        lines: [{ serviceCategory: "ASSEMBLY", serviceNamePattern: "Basic Assembly", quantity: 1 }],
    });
    await rebuildPricing({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertBookings({ orderUuid, items, eventStartDays: 7, eventEndDays: 9 });
    await insertStatusHistory(opts.platformId, orderUuid, opts.clientUserId, [
        { status: "DRAFT", daysFromEpoch: -5 },
        { status: "SUBMITTED", daysFromEpoch: -5 },
        { status: "PRICING_REVIEW", daysFromEpoch: -5 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -4 },
        { status: "QUOTED", daysFromEpoch: -3 },
        {
            status: "CONFIRMED",
            daysFromEpoch: -2,
            notes: "Client approved quote with PO PO-DEMO-0003.",
        },
    ]);
    await insertFinancialHistory(opts.platformId, orderUuid, opts.clientUserId, [
        { status: "PENDING_QUOTE", daysFromEpoch: -5 },
        { status: "QUOTE_SENT", daysFromEpoch: -3 },
        { status: "QUOTE_ACCEPTED", daysFromEpoch: -2 },
    ]);
};

const seedOrder4Delivered = async (opts: SeedDemoOrdersOpts) => {
    const orderUuid = DEMO_UUIDS.orders.order4Delivered;
    const items: OrderItemSpec[] = [
        { asset: opts.pooledAsset, quantity: 5 },
        { asset: opts.ledAsset, quantity: 1 },
    ];
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertOrderRow({
        orderUuid,
        publicOrderId: DEMO_ORDER_IDS.order4Delivered,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        cityId: opts.cityId,
        countryName: opts.countryName,
        cityName: opts.cityName,
        clientUserId: opts.clientUserId,
        eventStartDays: -2,
        eventEndDays: 2,
        venueName: "Burj Park",
        pricesId,
        orderStatus: "DELIVERED",
        financialStatus: "QUOTE_ACCEPTED",
        poNumber: "PO-DEMO-0004",
        items,
    });
    await insertOrderItems(opts.platformId, orderUuid, items);
    await insertCatalogLineItems({
        platformId: opts.platformId,
        orderUuid,
        addedBy: opts.logisticsUserId,
        lines: [
            { serviceCategory: "HANDLING", serviceNamePattern: "Loading", quantity: 4 },
            { serviceCategory: "TRANSPORT", serviceNamePattern: "Dubai (One Way)", quantity: 1 },
        ],
    });
    await rebuildPricing({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertBookings({ orderUuid, items, eventStartDays: -2, eventEndDays: 2 });
    await insertStatusHistory(opts.platformId, orderUuid, opts.logisticsUserId, [
        { status: "DRAFT", daysFromEpoch: -14 },
        { status: "SUBMITTED", daysFromEpoch: -14 },
        { status: "PRICING_REVIEW", daysFromEpoch: -14 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -13 },
        { status: "QUOTED", daysFromEpoch: -12 },
        { status: "CONFIRMED", daysFromEpoch: -11 },
        { status: "IN_PREPARATION", daysFromEpoch: -8 },
        { status: "READY_FOR_DELIVERY", daysFromEpoch: -4, notes: "Outbound scan complete." },
        { status: "IN_TRANSIT", daysFromEpoch: -3 },
        { status: "DELIVERED", daysFromEpoch: -2, notes: "All items signed for on site." },
    ]);
    await insertFinancialHistory(opts.platformId, orderUuid, opts.adminUserId, [
        { status: "PENDING_QUOTE", daysFromEpoch: -14 },
        { status: "QUOTE_SENT", daysFromEpoch: -12 },
        { status: "QUOTE_ACCEPTED", daysFromEpoch: -11 },
    ]);
};

const seedOrder5Closed = async (opts: SeedDemoOrdersOpts) => {
    const orderUuid = DEMO_UUIDS.orders.order5Closed;
    const items: OrderItemSpec[] = [
        { asset: opts.pooledAsset, quantity: 3 },
        { asset: opts.backdropAsset, quantity: 1 },
    ];
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertOrderRow({
        orderUuid,
        publicOrderId: DEMO_ORDER_IDS.order5Closed,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        cityId: opts.cityId,
        countryName: opts.countryName,
        cityName: opts.cityName,
        clientUserId: opts.clientUserId,
        eventStartDays: -10,
        eventEndDays: -8,
        venueName: "Emirates Towers",
        pricesId,
        orderStatus: "CLOSED",
        financialStatus: "PENDING_INVOICE",
        poNumber: "PO-DEMO-0005",
        items,
    });
    await insertOrderItems(opts.platformId, orderUuid, items);
    await insertCatalogLineItems({
        platformId: opts.platformId,
        orderUuid,
        addedBy: opts.logisticsUserId,
        lines: [
            { serviceCategory: "HANDLING", serviceNamePattern: "Loading", quantity: 3 },
            { serviceCategory: "TRANSPORT", serviceNamePattern: "Dubai (Round Trip)", quantity: 1 },
        ],
    });
    await rebuildPricing({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    // No bookings — already released on CLOSE.
    await insertStatusHistory(opts.platformId, orderUuid, opts.logisticsUserId, [
        { status: "DRAFT", daysFromEpoch: -22 },
        { status: "SUBMITTED", daysFromEpoch: -22 },
        { status: "PRICING_REVIEW", daysFromEpoch: -22 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -21 },
        { status: "QUOTED", daysFromEpoch: -20 },
        { status: "CONFIRMED", daysFromEpoch: -19 },
        { status: "IN_PREPARATION", daysFromEpoch: -16 },
        { status: "READY_FOR_DELIVERY", daysFromEpoch: -12 },
        { status: "IN_TRANSIT", daysFromEpoch: -11 },
        { status: "DELIVERED", daysFromEpoch: -10 },
        { status: "IN_USE", daysFromEpoch: -10 },
        { status: "DERIG", daysFromEpoch: -8 },
        { status: "AWAITING_RETURN", daysFromEpoch: -8 },
        { status: "RETURN_IN_TRANSIT", daysFromEpoch: -7 },
        {
            status: "CLOSED",
            daysFromEpoch: -7,
            notes: "Inbound scan complete. All items returned.",
        },
    ]);
    await insertFinancialHistory(opts.platformId, orderUuid, opts.adminUserId, [
        { status: "PENDING_QUOTE", daysFromEpoch: -22 },
        { status: "QUOTE_SENT", daysFromEpoch: -20 },
        { status: "QUOTE_ACCEPTED", daysFromEpoch: -19 },
        { status: "PENDING_INVOICE", daysFromEpoch: -7 },
    ]);
};

const seedOrder6Cancelled = async (opts: SeedDemoOrdersOpts) => {
    const orderUuid = DEMO_UUIDS.orders.order6Cancelled;
    const items: OrderItemSpec[] = [{ asset: opts.pooledAsset, quantity: 8 }];
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertOrderRow({
        orderUuid,
        publicOrderId: DEMO_ORDER_IDS.order6Cancelled,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        cityId: opts.cityId,
        countryName: opts.countryName,
        cityName: opts.cityName,
        clientUserId: opts.clientUserId,
        eventStartDays: 30,
        eventEndDays: 32,
        venueName: "JBR Beach Walk",
        pricesId,
        orderStatus: "CANCELLED",
        financialStatus: "CANCELLED",
        items,
    });
    await insertOrderItems(opts.platformId, orderUuid, items);
    await insertCatalogLineItems({
        platformId: opts.platformId,
        orderUuid,
        addedBy: opts.logisticsUserId,
        lines: [{ serviceCategory: "ASSEMBLY", serviceNamePattern: "Basic Assembly", quantity: 1 }],
    });
    await rebuildPricing({
        platformId: opts.platformId,
        orderUuid,
        calculatedBy: opts.logisticsUserId,
    });
    // No bookings — cancelled before CONFIRMED.
    await insertStatusHistory(opts.platformId, orderUuid, opts.adminUserId, [
        { status: "DRAFT", daysFromEpoch: -2 },
        { status: "SUBMITTED", daysFromEpoch: -2 },
        { status: "PRICING_REVIEW", daysFromEpoch: -2 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -1 },
        { status: "QUOTED", daysFromEpoch: 0 },
        {
            status: "CANCELLED",
            daysFromEpoch: 1,
            notes: "Client declined quote — timing conflict with another event.",
        },
    ]);
    await insertFinancialHistory(opts.platformId, orderUuid, opts.adminUserId, [
        { status: "PENDING_QUOTE", daysFromEpoch: -2 },
        { status: "QUOTE_SENT", daysFromEpoch: 0 },
        { status: "CANCELLED", daysFromEpoch: 1 },
    ]);
};

// ─────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────

export const seedDemoOrders = async (opts: SeedDemoOrdersOpts): Promise<SeededOrders> => {
    console.log(`📋 Seeding 6 demo orders (epoch ${DEMO_EPOCH.toISOString().slice(0, 10)})...`);

    await seedOrder1Submitted(opts);
    console.log(`  ✓ ${DEMO_ORDER_IDS.order1Submitted} — SUBMITTED`);
    await seedOrder2Quoted(opts);
    console.log(`  ✓ ${DEMO_ORDER_IDS.order2Quoted} — QUOTED`);
    await seedOrder3Confirmed(opts);
    console.log(`  ✓ ${DEMO_ORDER_IDS.order3Confirmed} — CONFIRMED`);
    await seedOrder4Delivered(opts);
    console.log(`  ✓ ${DEMO_ORDER_IDS.order4Delivered} — DELIVERED (with bookings)`);
    await seedOrder5Closed(opts);
    console.log(`  ✓ ${DEMO_ORDER_IDS.order5Closed} — CLOSED (bookings released)`);
    await seedOrder6Cancelled(opts);
    console.log(`  ✓ ${DEMO_ORDER_IDS.order6Cancelled} — CANCELLED`);

    return {
        order1Submitted: {
            id: DEMO_UUIDS.orders.order1Submitted,
            orderId: DEMO_ORDER_IDS.order1Submitted,
        },
        order2Quoted: { id: DEMO_UUIDS.orders.order2Quoted, orderId: DEMO_ORDER_IDS.order2Quoted },
        order3Confirmed: {
            id: DEMO_UUIDS.orders.order3Confirmed,
            orderId: DEMO_ORDER_IDS.order3Confirmed,
        },
        order4Delivered: {
            id: DEMO_UUIDS.orders.order4Delivered,
            orderId: DEMO_ORDER_IDS.order4Delivered,
        },
        order5Closed: { id: DEMO_UUIDS.orders.order5Closed, orderId: DEMO_ORDER_IDS.order5Closed },
        order6Cancelled: {
            id: DEMO_UUIDS.orders.order6Cancelled,
            orderId: DEMO_ORDER_IDS.order6Cancelled,
        },
    };
};
