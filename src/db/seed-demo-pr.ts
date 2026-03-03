/**
 * DEMO PR OVERLAY SEED
 *
 * Purpose:
 * 1) Run baseline demo seed (rich workflows)
 * 2) Overlay Pernod asset bundle import
 * 3) Add RFQ-aligned service catalog
 * 4) Ensure full demo coverage for order/inbound/service-request states
 *
 * Run: bun run db:seed:demo:pr
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { lineItemIdGenerator } from "../app/modules/order-line-items/order-line-items.utils";
import { seedPrAssets } from "./scripts/seed-pr-assets";

type DemoOrderStatus =
    | "PRICING_REVIEW"
    | "PENDING_APPROVAL"
    | "QUOTED"
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
    | "DECLINED"
    | "CANCELLED";

type FinancialStatus =
    | "PENDING_QUOTE"
    | "QUOTE_SENT"
    | "QUOTE_REVISED"
    | "QUOTE_ACCEPTED"
    | "PENDING_INVOICE"
    | "INVOICED"
    | "PAID"
    | "CANCELLED";

type SeedContext = {
    platform: typeof schema.platforms.$inferSelect;
    company: typeof schema.companies.$inferSelect;
    warehouse: typeof schema.warehouses.$inferSelect;
    zone: typeof schema.zones.$inferSelect;
    adminUser: typeof schema.users.$inferSelect;
    logisticsUser: typeof schema.users.$inferSelect;
    clientUser: typeof schema.users.$inferSelect;
    citiesByName: Map<string, typeof schema.cities.$inferSelect>;
};

type CatalogServiceSeed = {
    name: string;
    category: "ASSEMBLY" | "EQUIPMENT" | "HANDLING" | "RESKIN" | "TRANSPORT" | "OTHER";
    unit: string;
    rate: string;
    description: string;
    city?: string;
    tripDirection?: "DELIVERY" | "PICKUP" | "ACCESS" | "TRANSFER";
};

type DemoAsset = {
    id: string;
    name: string;
    category: string;
    condition: "GREEN" | "ORANGE" | "RED";
    volume_per_unit: string;
    weight_per_unit: string;
    condition_notes: string | null;
    handling_tags: string[];
};

type OrderLineSeed = {
    line_item_type: "CATALOG" | "CUSTOM";
    billing_mode: "BILLABLE" | "NON_BILLABLE" | "COMPLIMENTARY";
    category: "ASSEMBLY" | "EQUIPMENT" | "HANDLING" | "RESKIN" | "TRANSPORT" | "OTHER";
    description: string;
    quantity: string;
    unit: string;
    unit_rate: string;
    total: string;
    service_type_id: string | null;
    added_by: string;
    client_price_visible?: boolean;
    notes?: string | null;
    metadata?: Record<string, unknown>;
};

const REQUIRED_ORDER_STATUSES: DemoOrderStatus[] = [
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
    "DECLINED",
    "CANCELLED",
];

const ORDER_ID_BY_STATUS: Record<DemoOrderStatus, string> = {
    PRICING_REVIEW: "DPR-PRV-01",
    PENDING_APPROVAL: "DPR-PAP-01",
    QUOTED: "DPR-QTD-01",
    CONFIRMED: "DPR-CFM-01",
    IN_PREPARATION: "DPR-PRP-01",
    READY_FOR_DELIVERY: "DPR-RFD-01",
    IN_TRANSIT: "DPR-TRN-01",
    DELIVERED: "DPR-DLV-01",
    IN_USE: "DPR-ONS-01",
    DERIG: "DPR-DRG-01",
    AWAITING_RETURN: "DPR-AWR-01",
    RETURN_IN_TRANSIT: "DPR-RIT-01",
    CLOSED: "DPR-CLS-01",
    DECLINED: "DPR-DEC-01",
    CANCELLED: "DPR-CAN-01",
};

const FINANCIAL_BY_ORDER_STATUS: Record<DemoOrderStatus, FinancialStatus> = {
    PRICING_REVIEW: "PENDING_QUOTE",
    PENDING_APPROVAL: "PENDING_QUOTE",
    QUOTED: "QUOTE_SENT",
    CONFIRMED: "QUOTE_ACCEPTED",
    IN_PREPARATION: "PENDING_INVOICE",
    READY_FOR_DELIVERY: "INVOICED",
    IN_TRANSIT: "INVOICED",
    DELIVERED: "INVOICED",
    IN_USE: "INVOICED",
    DERIG: "INVOICED",
    AWAITING_RETURN: "PAID",
    RETURN_IN_TRANSIT: "PAID",
    CLOSED: "PAID",
    DECLINED: "CANCELLED",
    CANCELLED: "CANCELLED",
};

const STATUS_DAY_OFFSET: Record<DemoOrderStatus, number> = {
    PRICING_REVIEW: 7,
    PENDING_APPROVAL: 9,
    QUOTED: 11,
    CONFIRMED: 13,
    IN_PREPARATION: 2,
    READY_FOR_DELIVERY: 1,
    IN_TRANSIT: 0,
    DELIVERED: -1,
    IN_USE: -1,
    DERIG: 0,
    AWAITING_RETURN: -1,
    RETURN_IN_TRANSIT: 0,
    CLOSED: -6,
    DECLINED: 5,
    CANCELLED: 4,
};

const RFQ_SERVICE_TYPES: CatalogServiceSeed[] = [
    {
        name: "Handling - In",
        category: "HANDLING",
        unit: "m3",
        rate: "9.60",
        description: "Inbound handling per cubic meter.",
    },
    {
        name: "Handling - Out",
        category: "HANDLING",
        unit: "m3",
        rate: "9.60",
        description: "Outbound handling per cubic meter.",
    },
    {
        name: "Picking Charges",
        category: "HANDLING",
        unit: "m3",
        rate: "6.00",
        description: "Picking and warehouse preparation per cubic meter.",
    },
    {
        name: "Assembly - Working Day",
        category: "ASSEMBLY",
        unit: "labour-hour",
        rate: "18.00",
        description: "Assembly labour rate for working days.",
    },
    {
        name: "Assembly - Holiday",
        category: "ASSEMBLY",
        unit: "labour-hour",
        rate: "25.00",
        description: "Assembly labour rate for holidays/weekends.",
    },
    {
        name: "Transport - Dubai (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "300.00",
        description: "One-way transport service for Dubai.",
        city: "Dubai",
        tripDirection: "DELIVERY",
    },
    {
        name: "Transport - Dubai (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "500.00",
        description: "Round-trip transport service for Dubai.",
        city: "Dubai",
        tripDirection: "TRANSFER",
    },
    {
        name: "Transport - Abu Dhabi (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "495.00",
        description: "One-way transport service for Abu Dhabi.",
        city: "Abu Dhabi",
        tripDirection: "DELIVERY",
    },
    {
        name: "Transport - Abu Dhabi (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "990.00",
        description: "Round-trip transport service for Abu Dhabi.",
        city: "Abu Dhabi",
        tripDirection: "TRANSFER",
    },
    {
        name: "Transport - Sharjah (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "400.00",
        description: "One-way transport service for Sharjah.",
        city: "Sharjah",
        tripDirection: "DELIVERY",
    },
    {
        name: "Transport - Sharjah (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "600.00",
        description: "Round-trip transport service for Sharjah.",
        city: "Sharjah",
        tripDirection: "TRANSFER",
    },
    {
        name: "Transport - Ajman (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "400.00",
        description: "One-way transport service for Ajman.",
        city: "Ajman",
        tripDirection: "DELIVERY",
    },
    {
        name: "Transport - Ajman (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "750.00",
        description: "Round-trip transport service for Ajman.",
        city: "Ajman",
        tripDirection: "TRANSFER",
    },
    {
        name: "Transport - Ras Al Khaimah (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "550.00",
        description: "One-way transport service for Ras Al Khaimah.",
        city: "Ras Al Khaimah",
        tripDirection: "DELIVERY",
    },
    {
        name: "Transport - Ras Al Khaimah (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "1100.00",
        description: "Round-trip transport service for Ras Al Khaimah.",
        city: "Ras Al Khaimah",
        tripDirection: "TRANSFER",
    },
    {
        name: "Transport - Fujairah (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "600.00",
        description: "One-way transport service for Fujairah.",
        city: "Fujairah",
        tripDirection: "DELIVERY",
    },
    {
        name: "Transport - Fujairah (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        rate: "1100.00",
        description: "Round-trip transport service for Fujairah.",
        city: "Fujairah",
        tripDirection: "TRANSFER",
    },
    {
        name: "Transport - Additional Intra-Emirate Trip",
        category: "TRANSPORT",
        unit: "trip",
        rate: "180.00",
        description: "Additional trip within the same emirate.",
        tripDirection: "ACCESS",
    },
    {
        name: "Forklift - 3 Ton (Hourly)",
        category: "EQUIPMENT",
        unit: "hour",
        rate: "140.00",
        description: "3-ton forklift hourly deployment.",
    },
    {
        name: "Forklift - 5 Ton (Hourly)",
        category: "EQUIPMENT",
        unit: "hour",
        rate: "200.00",
        description: "5-ton forklift hourly deployment.",
    },
    {
        name: "Forklift - 10 Ton (Hourly)",
        category: "EQUIPMENT",
        unit: "hour",
        rate: "260.00",
        description: "10-ton forklift hourly deployment.",
    },
    {
        name: "Forklift - 3 Ton Mobilization",
        category: "EQUIPMENT",
        unit: "trip",
        rate: "960.00",
        description: "3-ton forklift mobilization and demobilization.",
    },
    {
        name: "Forklift - 5 Ton Mobilization",
        category: "EQUIPMENT",
        unit: "trip",
        rate: "1080.00",
        description: "5-ton forklift mobilization and demobilization.",
    },
];

const ensureValue = <T>(value: T | undefined | null, message: string): T => {
    if (!value) throw new Error(message);
    return value;
};

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const statusRank = (status: DemoOrderStatus): number => {
    const rank: Record<DemoOrderStatus, number> = {
        PRICING_REVIEW: 1,
        PENDING_APPROVAL: 2,
        QUOTED: 3,
        CONFIRMED: 4,
        IN_PREPARATION: 5,
        READY_FOR_DELIVERY: 6,
        IN_TRANSIT: 7,
        DELIVERED: 8,
        IN_USE: 9,
        DERIG: 10,
        AWAITING_RETURN: 11,
        RETURN_IN_TRANSIT: 12,
        CLOSED: 13,
        DECLINED: 14,
        CANCELLED: 15,
    };
    return rank[status];
};

const mockImage = (bg: string, text: string) =>
    `https://placehold.co/1200x800/${bg}/FFFFFF?text=${encodeURIComponent(text)}`;

const runBaseDemoSeed = () => {
    console.log("\n[1/7] Running baseline demo seed (seed.ts)…\n");
    const result = spawnSync("bun", ["run", "src/db/seed.ts"], {
        cwd: process.cwd(),
        stdio: "inherit",
        env: process.env,
    });

    if (result.status !== 0) {
        throw new Error(`Baseline seed failed with status code ${result.status}`);
    }
};

const loadContext = async (): Promise<SeedContext> => {
    const [platform] = await db
        .select()
        .from(schema.platforms)
        .where(eq(schema.platforms.domain, "kadence.ae"))
        .limit(1);

    const [company] = await db
        .select()
        .from(schema.companies)
        .where(
            and(
                eq(schema.companies.platform_id, platform?.id || ""),
                eq(schema.companies.name, "Pernod Ricard")
            )
        )
        .limit(1);

    const [warehouse] = await db
        .select()
        .from(schema.warehouses)
        .where(eq(schema.warehouses.platform_id, platform?.id || ""))
        .limit(1);

    const [zone] = await db
        .select()
        .from(schema.zones)
        .where(
            and(
                eq(schema.zones.platform_id, platform?.id || ""),
                eq(schema.zones.company_id, company?.id || "")
            )
        )
        .limit(1);

    const [adminUser] = await db
        .select()
        .from(schema.users)
        .where(
            and(
                eq(schema.users.platform_id, platform?.id || ""),
                eq(schema.users.email, "admin@test.com")
            )
        )
        .limit(1);

    const [logisticsUser] = await db
        .select()
        .from(schema.users)
        .where(
            and(
                eq(schema.users.platform_id, platform?.id || ""),
                eq(schema.users.email, "logistics@test.com")
            )
        )
        .limit(1);

    const [clientUser] = await db
        .select()
        .from(schema.users)
        .where(
            and(
                eq(schema.users.platform_id, platform?.id || ""),
                eq(schema.users.email, "client@pernod-ricard.com")
            )
        )
        .limit(1);

    const cityRows = await db
        .select()
        .from(schema.cities)
        .where(eq(schema.cities.platform_id, platform?.id || ""));

    const safePlatform = ensureValue(platform, "Platform not found after baseline seed");
    const safeCompany = ensureValue(company, "Pernod Ricard company not found");
    const safeWarehouse = ensureValue(warehouse, "Warehouse not found");
    const safeZone = ensureValue(zone, "Zone not found for Pernod Ricard");
    const safeAdmin = ensureValue(adminUser, "Admin user not found");
    const safeLogistics = ensureValue(logisticsUser, "Logistics user not found");
    const safeClient = ensureValue(clientUser, "Client user not found");

    return {
        platform: safePlatform,
        company: safeCompany,
        warehouse: safeWarehouse,
        zone: safeZone,
        adminUser: safeAdmin,
        logisticsUser: safeLogistics,
        clientUser: safeClient,
        citiesByName: new Map(cityRows.map((city) => [city.name, city])),
    };
};

const ensureCompanyBaseOpsRate = async (ctx: SeedContext) => {
    console.log("\n[2/7] Aligning Pernod warehouse ops rate for demo…");
    await db
        .update(schema.companies)
        .set({ warehouse_ops_rate: "15.60", updated_at: new Date() })
        .where(eq(schema.companies.id, ctx.company.id));
};

const importPrAssets = async (ctx: SeedContext) => {
    console.log("\n[3/7] Importing Pernod asset bundle into seeded demo…\n");
    await seedPrAssets({
        platformId: ctx.platform.id,
        companyId: ctx.company.id,
        warehouseId: ctx.warehouse.id,
        zoneId: ctx.zone.id,
        verbose: true,
    });
};

const upsertRfqServiceTypes = async (
    ctx: SeedContext
): Promise<Map<string, typeof schema.serviceTypes.$inferSelect>> => {
    console.log("\n[4/7] Upserting RFQ-aligned service catalog…");

    const results = new Map<string, typeof schema.serviceTypes.$inferSelect>();

    for (let index = 0; index < RFQ_SERVICE_TYPES.length; index += 1) {
        const seed = RFQ_SERVICE_TYPES[index];
        const cityId = seed.city ? ctx.citiesByName.get(seed.city)?.id || null : null;

        const defaultMetadata: Record<string, unknown> = {};
        if (cityId) defaultMetadata.city_id = cityId;
        if (seed.tripDirection) defaultMetadata.trip_direction = seed.tripDirection;

        const [existing] = await db
            .select()
            .from(schema.serviceTypes)
            .where(
                and(
                    eq(schema.serviceTypes.platform_id, ctx.platform.id),
                    eq(schema.serviceTypes.name, seed.name)
                )
            )
            .limit(1);

        if (existing) {
            const [updated] = await db
                .update(schema.serviceTypes)
                .set({
                    category: seed.category,
                    unit: seed.unit,
                    default_rate: seed.rate,
                    default_metadata: defaultMetadata,
                    description: seed.description,
                    display_order: index,
                    is_active: true,
                })
                .where(eq(schema.serviceTypes.id, existing.id))
                .returning();
            results.set(seed.name, updated);
        } else {
            const [created] = await db
                .insert(schema.serviceTypes)
                .values({
                    platform_id: ctx.platform.id,
                    name: seed.name,
                    category: seed.category,
                    unit: seed.unit,
                    default_rate: seed.rate,
                    default_metadata: defaultMetadata,
                    description: seed.description,
                    display_order: index,
                    is_active: true,
                })
                .returning();
            results.set(seed.name, created);
        }
    }

    console.log(`✓ RFQ catalog ready (${results.size} service types)`);
    return results;
};

const createPriceRecord = async (opts: {
    platformId: string;
    entityType: "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST";
    entityId: string;
    marginPercent: number;
    vatPercent: number;
    calculatedBy: string;
    breakdownLines?: Record<string, unknown>[];
}) => {
    const [price] = await db
        .insert(schema.prices)
        .values({
            platform_id: opts.platformId,
            entity_type: opts.entityType,
            entity_id: opts.entityId,
            breakdown_lines: opts.breakdownLines || [],
            margin_percent: opts.marginPercent.toFixed(2),
            vat_percent: opts.vatPercent.toFixed(2),
            margin_is_override: false,
            margin_override_reason: null,
            calculated_at: new Date(),
            calculated_by: opts.calculatedBy,
        })
        .returning();
    return price;
};

const orderPath = (status: DemoOrderStatus): DemoOrderStatus[] => {
    const mainPath: DemoOrderStatus[] = [
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
    ];

    if (status === "DECLINED") return ["PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "DECLINED"];
    if (status === "CANCELLED")
        return ["PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "CANCELLED"];

    const idx = mainPath.indexOf(status);
    if (idx === -1) return [status];
    return mainPath.slice(0, idx + 1);
};

const financialPath = (finalStatus: FinancialStatus): FinancialStatus[] => {
    const pathByFinal: Record<FinancialStatus, FinancialStatus[]> = {
        PENDING_QUOTE: ["PENDING_QUOTE"],
        QUOTE_SENT: ["PENDING_QUOTE", "QUOTE_SENT"],
        QUOTE_REVISED: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_REVISED"],
        QUOTE_ACCEPTED: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED"],
        PENDING_INVOICE: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED", "PENDING_INVOICE"],
        INVOICED: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED", "PENDING_INVOICE", "INVOICED"],
        PAID: [
            "PENDING_QUOTE",
            "QUOTE_SENT",
            "QUOTE_ACCEPTED",
            "PENDING_INVOICE",
            "INVOICED",
            "PAID",
        ],
        CANCELLED: ["PENDING_QUOTE", "QUOTE_SENT", "CANCELLED"],
    };
    return pathByFinal[finalStatus];
};

const composeBreakdownLines = (opts: {
    volume: number;
    warehouseOpsRate: number;
    marginPercent: number;
    createdBy: string;
    lineItems: OrderLineSeed[];
}) => {
    const marginMultiplier = 1 + opts.marginPercent / 100;
    const nowIso = new Date().toISOString();

    const baseBuy = Number((opts.volume * opts.warehouseOpsRate).toFixed(2));
    const baseSell = Number((baseBuy * marginMultiplier).toFixed(2));

    const lines: Record<string, unknown>[] = [
        {
            line_id: "BASE_OPS",
            line_kind: "BASE_OPS",
            category: "BASE_OPS",
            label: `Picking & Handling (${opts.volume.toFixed(3)} m³)`,
            quantity: 1,
            unit: "service",
            buy_unit_price: baseBuy,
            buy_total: baseBuy,
            sell_unit_price: baseSell,
            sell_total: baseSell,
            billing_mode: "BILLABLE",
            source: {
                mode: "WAREHOUSE_OPS_RATE",
                service_type_id: null,
                service_type_name_snapshot: "Picking & Handling",
                service_type_rate_snapshot: Number(opts.warehouseOpsRate.toFixed(2)),
            },
            is_voided: false,
            notes: null,
            created_by: opts.createdBy,
            created_at: nowIso,
            updated_by: opts.createdBy,
            updated_at: nowIso,
            voided_by: null,
            voided_at: null,
            void_reason: null,
            client_price_visible: false,
        },
    ];

    for (const item of opts.lineItems) {
        if (item.billing_mode !== "BILLABLE") continue;
        const buyUnit = Number(item.unit_rate);
        const qty = Number(item.quantity);
        const buyTotal = Number(item.total);
        const sellUnit = Number((buyUnit * marginMultiplier).toFixed(2));
        const sellTotal = Number((buyTotal * marginMultiplier).toFixed(2));

        lines.push({
            line_id: item.service_type_id || `CUSTOM-${item.description.slice(0, 8)}`,
            line_kind: item.line_item_type === "CATALOG" ? "RATE_CARD" : "CUSTOM",
            category: item.category,
            label: item.description,
            quantity: qty,
            unit: item.unit,
            buy_unit_price: buyUnit,
            buy_total: buyTotal,
            sell_unit_price: sellUnit,
            sell_total: sellTotal,
            billing_mode: item.billing_mode,
            source: {
                mode: item.line_item_type === "CATALOG" ? "SERVICE_TYPE" : "MANUAL",
                service_type_id: item.service_type_id,
                service_type_name_snapshot: item.description,
                service_type_rate_snapshot: buyUnit,
            },
            is_voided: false,
            notes: item.notes || null,
            created_by: item.added_by,
            created_at: nowIso,
            updated_by: item.added_by,
            updated_at: nowIso,
            voided_by: null,
            voided_at: null,
            void_reason: null,
            client_price_visible: item.client_price_visible === true,
        });
    }

    return lines;
};

const pickDemoAssets = async (ctx: SeedContext): Promise<DemoAsset[]> => {
    const rows = await db
        .select({
            id: schema.assets.id,
            name: schema.assets.name,
            category: schema.assets.category,
            condition: schema.assets.condition,
            volume_per_unit: schema.assets.volume_per_unit,
            weight_per_unit: schema.assets.weight_per_unit,
            condition_notes: schema.assets.condition_notes,
            handling_tags: schema.assets.handling_tags,
        })
        .from(schema.assets)
        .where(
            and(
                eq(schema.assets.platform_id, ctx.platform.id),
                eq(schema.assets.company_id, ctx.company.id),
                isNull(schema.assets.deleted_at)
            )
        );

    return rows as DemoAsset[];
};

const ensureOrderStatusCoverage = async (
    ctx: SeedContext,
    serviceTypes: Map<string, typeof schema.serviceTypes.$inferSelect>
) => {
    console.log("\n[5/7] Ensuring complete order status walkthrough matrix…");

    const existingOrders = await db
        .select({
            id: schema.orders.id,
            order_status: schema.orders.order_status,
            order_id: schema.orders.order_id,
        })
        .from(schema.orders)
        .where(
            and(
                eq(schema.orders.platform_id, ctx.platform.id),
                eq(schema.orders.company_id, ctx.company.id)
            )
        );

    const existingStatuses = new Set(
        existingOrders.map((row) => row.order_status as DemoOrderStatus)
    );
    const demoAssets = await pickDemoAssets(ctx);

    if (demoAssets.length < 4) {
        throw new Error("Not enough Pernod assets found for demo order generation");
    }

    const cityFallback = ensureValue(ctx.citiesByName.get("Dubai"), "Dubai city not found");
    const brand = ensureValue(
        (
            await db
                .select()
                .from(schema.brands)
                .where(
                    and(
                        eq(schema.brands.platform_id, ctx.platform.id),
                        eq(schema.brands.company_id, ctx.company.id),
                        eq(schema.brands.is_active, true)
                    )
                )
                .limit(1)
        )[0],
        "Active Pernod brand not found"
    );

    const createdStatuses: string[] = [];

    for (const status of REQUIRED_ORDER_STATUSES) {
        if (existingStatuses.has(status)) continue;

        const orderDbId = randomUUID();
        const eventStart = daysFromNow(STATUS_DAY_OFFSET[status]);
        const eventEnd = daysFromNow(STATUS_DAY_OFFSET[status] + 2);
        const volume = Number((8 + statusRank(status) * 0.37).toFixed(3));

        const lineSeeds: OrderLineSeed[] = [];
        const pickingSvc = serviceTypes.get("Picking Charges");
        const handlingOutSvc = serviceTypes.get("Handling - Out");
        const transportSvc = serviceTypes.get("Transport - Dubai (Round Trip)");
        const assemblySvc = serviceTypes.get("Assembly - Working Day");

        if (
            [
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
            ].includes(status)
        ) {
            if (pickingSvc) {
                lineSeeds.push({
                    line_item_type: "CATALOG",
                    billing_mode: "BILLABLE",
                    category: "HANDLING",
                    description: "Picking Charges",
                    quantity: "12.00",
                    unit: pickingSvc.unit,
                    unit_rate: String(pickingSvc.default_rate || "6.00"),
                    total: (12 * Number(pickingSvc.default_rate || 6)).toFixed(2),
                    service_type_id: pickingSvc.id,
                    added_by: ctx.logisticsUser.id,
                    client_price_visible: false,
                });
            }
            if (handlingOutSvc) {
                lineSeeds.push({
                    line_item_type: "CATALOG",
                    billing_mode: "BILLABLE",
                    category: "HANDLING",
                    description: "Handling - Out",
                    quantity: "12.00",
                    unit: handlingOutSvc.unit,
                    unit_rate: String(handlingOutSvc.default_rate || "9.60"),
                    total: (12 * Number(handlingOutSvc.default_rate || 9.6)).toFixed(2),
                    service_type_id: handlingOutSvc.id,
                    added_by: ctx.logisticsUser.id,
                    client_price_visible: status === "QUOTED",
                });
            }
            if (transportSvc) {
                lineSeeds.push({
                    line_item_type: "CATALOG",
                    billing_mode: "BILLABLE",
                    category: "TRANSPORT",
                    description: "Transport - Dubai (Round Trip)",
                    quantity: "1.00",
                    unit: transportSvc.unit,
                    unit_rate: String(transportSvc.default_rate || "500.00"),
                    total: String(Number(transportSvc.default_rate || "500.00").toFixed(2)),
                    service_type_id: transportSvc.id,
                    added_by: ctx.logisticsUser.id,
                    client_price_visible: status === "QUOTED",
                });
            }
            if (
                assemblySvc &&
                ["IN_PREPARATION", "READY_FOR_DELIVERY", "IN_TRANSIT"].includes(status)
            ) {
                lineSeeds.push({
                    line_item_type: "CATALOG",
                    billing_mode: "BILLABLE",
                    category: "ASSEMBLY",
                    description: "Assembly - Working Day",
                    quantity: "6.00",
                    unit: assemblySvc.unit,
                    unit_rate: String(assemblySvc.default_rate || "18.00"),
                    total: (6 * Number(assemblySvc.default_rate || 18)).toFixed(2),
                    service_type_id: assemblySvc.id,
                    added_by: ctx.logisticsUser.id,
                    client_price_visible: false,
                });
            }
        }

        if (status === "IN_PREPARATION") {
            lineSeeds.push({
                line_item_type: "CUSTOM",
                billing_mode: "NON_BILLABLE",
                category: "TRANSPORT",
                description: "Site access escort vehicle",
                quantity: "1.00",
                unit: "trip",
                unit_rate: "180.00",
                total: "180.00",
                service_type_id: null,
                added_by: ctx.adminUser.id,
                client_price_visible: false,
                notes: "Operational support only",
                metadata: { reason: "site_access" },
            });
        }

        if (status === "QUOTED") {
            lineSeeds.push({
                line_item_type: "CUSTOM",
                billing_mode: "COMPLIMENTARY",
                category: "OTHER",
                description: "Complimentary standby support",
                quantity: "1.00",
                unit: "trip",
                unit_rate: "120.00",
                total: "120.00",
                service_type_id: null,
                added_by: ctx.adminUser.id,
                client_price_visible: false,
                notes: "Demo goodwill line",
                metadata: { reason: "demo" },
            });
        }

        const breakdown = composeBreakdownLines({
            volume,
            warehouseOpsRate: Number(ctx.company.warehouse_ops_rate),
            marginPercent: Number(ctx.company.platform_margin_percent),
            createdBy: ctx.adminUser.id,
            lineItems: lineSeeds,
        });

        const price = await createPriceRecord({
            platformId: ctx.platform.id,
            entityType: "ORDER",
            entityId: orderDbId,
            marginPercent: Number(ctx.company.platform_margin_percent),
            vatPercent: Number(ctx.platform.vat_percent || 0),
            calculatedBy: ctx.adminUser.id,
            breakdownLines: breakdown,
        });

        const [createdOrder] = await db
            .insert(schema.orders)
            .values({
                id: orderDbId,
                platform_id: ctx.platform.id,
                order_id: ORDER_ID_BY_STATUS[status],
                company_id: ctx.company.id,
                brand_id: brand.id,
                created_by: ctx.clientUser.id,
                job_number:
                    statusRank(status) >= 4
                        ? `JOB-DPR-${String(statusRank(status)).padStart(3, "0")}`
                        : null,
                contact_name: ctx.clientUser.name,
                contact_email: ctx.clientUser.email,
                contact_phone: ctx.company.contact_phone || "+971-50-111-1111",
                event_start_date: eventStart,
                event_end_date: eventEnd,
                venue_name: `Demo Venue ${statusRank(status)} - Dubai`,
                venue_city_id: cityFallback.id,
                venue_location: {
                    country: "United Arab Emirates",
                    city: "Dubai",
                    address: `Demo Hall ${statusRank(status)}, DWTC`,
                    access_notes: "Use service gate B. Coordinate with venue logistics lead.",
                },
                special_instructions: `Demo order for ${status} walkthrough`,
                delivery_window:
                    statusRank(status) >= statusRank("CONFIRMED")
                        ? {
                              start: new Date(eventStart.getTime() - 24 * 3600000),
                              end: new Date(eventStart.getTime() - 23 * 3600000),
                          }
                        : null,
                pickup_window:
                    statusRank(status) >= statusRank("AWAITING_RETURN")
                        ? {
                              start: new Date(eventEnd.getTime() + 12 * 3600000),
                              end: new Date(eventEnd.getTime() + 14 * 3600000),
                          }
                        : null,
                calculated_totals: {
                    volume: volume.toFixed(3),
                    weight: (volume * 130).toFixed(2),
                },
                order_pricing_id: price.id,
                order_status: status,
                financial_status: FINANCIAL_BY_ORDER_STATUS[status],
                scanning_data: {},
                delivery_photos: [],
            })
            .returning();

        const assetSlice = demoAssets.slice(
            statusRank(status) % (demoAssets.length - 3),
            (statusRank(status) % (demoAssets.length - 3)) + 3
        );

        for (const [idx, asset] of assetSlice.entries()) {
            const quantity = idx === 2 ? 6 : 1;
            const volumePerUnit =
                Number(asset.volume_per_unit || 0) > 0 ? Number(asset.volume_per_unit) : 0.35;
            const weightPerUnit =
                Number(asset.weight_per_unit || 0) > 0 ? Number(asset.weight_per_unit) : 16;
            const maintenanceDecision = asset.condition === "RED" ? "FIX_IN_ORDER" : null;
            const requiresMaintenance = asset.condition === "RED";

            await db.insert(schema.orderItems).values({
                platform_id: ctx.platform.id,
                order_id: createdOrder.id,
                asset_id: asset.id,
                asset_name: asset.name,
                quantity,
                volume_per_unit: volumePerUnit.toFixed(3),
                weight_per_unit: weightPerUnit.toFixed(2),
                total_volume: (volumePerUnit * quantity).toFixed(3),
                total_weight: (weightPerUnit * quantity).toFixed(2),
                condition_notes: asset.condition_notes,
                handling_tags: asset.handling_tags || [],
                from_collection: null,
                from_collection_name: null,
                maintenance_decision: maintenanceDecision,
                requires_maintenance: requiresMaintenance,
                maintenance_refurb_days_snapshot: requiresMaintenance ? 5 : null,
                maintenance_decision_locked_at: maintenanceDecision ? new Date() : null,
            });
        }

        for (const line of lineSeeds) {
            const lineItemId = await lineItemIdGenerator(ctx.platform.id);
            await db.insert(schema.lineItems).values({
                platform_id: ctx.platform.id,
                order_id: createdOrder.id,
                inbound_request_id: null,
                service_request_id: null,
                line_item_id: lineItemId,
                purpose_type: "ORDER",
                service_type_id: line.service_type_id,
                line_item_type: line.line_item_type,
                billing_mode: line.billing_mode,
                category: line.category,
                description: line.description,
                quantity: line.quantity,
                unit: line.unit,
                unit_rate: line.unit_rate,
                total: line.total,
                added_by: line.added_by,
                added_at: new Date(),
                notes: line.notes || null,
                metadata: line.metadata || {},
                client_price_visible: line.client_price_visible === true,
                is_voided: false,
            });
        }

        const statusTimeline = orderPath(status);
        const statusStart = new Date(
            createdOrder.created_at.getTime() - statusTimeline.length * 3600000
        );
        for (let i = 0; i < statusTimeline.length; i += 1) {
            await db.insert(schema.orderStatusHistory).values({
                platform_id: ctx.platform.id,
                order_id: createdOrder.id,
                status: statusTimeline[i],
                notes:
                    i === statusTimeline.length - 1
                        ? `Current demo stage: ${statusTimeline[i]}`
                        : `Progressed to ${statusTimeline[i]}`,
                updated_by: i < 2 ? ctx.logisticsUser.id : ctx.adminUser.id,
                timestamp: new Date(statusStart.getTime() + i * 3600000),
            });
        }

        const finTimeline = financialPath(FINANCIAL_BY_ORDER_STATUS[status]);
        const finStart = new Date(createdOrder.created_at.getTime() - finTimeline.length * 3300000);
        for (let i = 0; i < finTimeline.length; i += 1) {
            await db.insert(schema.financialStatusHistory).values({
                platform_id: ctx.platform.id,
                order_id: createdOrder.id,
                status: finTimeline[i],
                notes: `Financial progression: ${finTimeline[i]}`,
                updated_by:
                    finTimeline[i] === "QUOTE_ACCEPTED" ? ctx.clientUser.id : ctx.adminUser.id,
                timestamp: new Date(finStart.getTime() + i * 3300000),
            });
        }

        createdStatuses.push(status);
    }

    if (createdStatuses.length === 0) {
        console.log("✓ All required order statuses already covered.");
    } else {
        console.log(`✓ Created demo orders for missing statuses: ${createdStatuses.join(", ")}`);
    }
};

const insertScanEvent = async (opts: {
    orderId: string;
    assetId: string;
    scanType:
        | "OUTBOUND"
        | "INBOUND"
        | "DERIG_CAPTURE"
        | "OUTBOUND_TRUCK_PHOTOS"
        | "RETURN_TRUCK_PHOTOS"
        | "ON_SITE_CAPTURE";
    scannedBy: string;
    quantity?: number;
    condition?: "GREEN" | "ORANGE" | "RED" | null;
    note?: string | null;
    discrepancy?: "BROKEN" | "LOST" | "OTHER" | null;
    media: Array<{ url: string; note?: string; kind: string }>;
}) => {
    const [event] = await db
        .insert(schema.scanEvents)
        .values({
            order_id: opts.orderId,
            asset_id: opts.assetId,
            scan_type: opts.scanType,
            quantity: opts.quantity || 1,
            condition: opts.condition || null,
            notes: opts.note || null,
            discrepancy_reason: opts.discrepancy || null,
            metadata: { seeded_by: "seed-demo-pr" },
            scanned_by: opts.scannedBy,
            scanned_at: new Date(),
        })
        .returning({ id: schema.scanEvents.id });

    await db.insert(schema.scanEventAssets).values({
        scan_event_id: event.id,
        asset_id: opts.assetId,
        quantity: opts.quantity || 1,
    });

    if (opts.media.length > 0) {
        await db.insert(schema.scanEventMedia).values(
            opts.media.map((entry, index) => ({
                scan_event_id: event.id,
                url: entry.url,
                note: entry.note || null,
                media_kind: entry.kind,
                sort_order: index,
            }))
        );
    }
};

const ensureScanCoverage = async (ctx: SeedContext) => {
    console.log("\n[6/7] Ensuring scan activity coverage with mock media…");

    const orderRows = await db
        .select({
            id: schema.orders.id,
            order_id: schema.orders.order_id,
            order_status: schema.orders.order_status,
        })
        .from(schema.orders)
        .where(
            and(
                eq(schema.orders.platform_id, ctx.platform.id),
                eq(schema.orders.company_id, ctx.company.id)
            )
        );

    for (const order of orderRows) {
        const items = await db
            .select({
                asset_id: schema.orderItems.asset_id,
                quantity: schema.orderItems.quantity,
                asset_name: schema.orderItems.asset_name,
            })
            .from(schema.orderItems)
            .where(eq(schema.orderItems.order_id, order.id));

        if (items.length === 0) continue;

        const primary = items[0];

        const existingTypes = new Set(
            (
                await db
                    .select({ scan_type: schema.scanEvents.scan_type })
                    .from(schema.scanEvents)
                    .where(eq(schema.scanEvents.order_id, order.id))
            ).map((row) => row.scan_type)
        );

        const rank = statusRank(order.order_status as DemoOrderStatus);

        if (rank >= statusRank("READY_FOR_DELIVERY") && !existingTypes.has("OUTBOUND")) {
            await insertScanEvent({
                orderId: order.id,
                assetId: primary.asset_id,
                scanType: "OUTBOUND",
                scannedBy: ctx.logisticsUser.id,
                quantity: primary.quantity,
                condition: "GREEN",
                note: "Outbound scan completed for loading manifest.",
                media: [
                    {
                        url: mockImage("334155", `${order.order_id}\\nOutbound\\nLoading Bay`),
                        note: "Pre-dispatch verification",
                        kind: "GENERAL",
                    },
                ],
            });
        }

        if (rank >= statusRank("DELIVERED") && !existingTypes.has("OUTBOUND_TRUCK_PHOTOS")) {
            await insertScanEvent({
                orderId: order.id,
                assetId: primary.asset_id,
                scanType: "OUTBOUND_TRUCK_PHOTOS",
                scannedBy: ctx.logisticsUser.id,
                quantity: 1,
                condition: null,
                note: "Outbound truck photos captured at dispatch.",
                media: [
                    {
                        url: mockImage("1D4ED8", `${order.order_id}\\nTruck Dispatch\\nPhoto 1`),
                        note: "Truck gate-out",
                        kind: "GENERAL",
                    },
                    {
                        url: mockImage("2563EB", `${order.order_id}\\nTruck Dispatch\\nPhoto 2`),
                        note: "Load secured",
                        kind: "GENERAL",
                    },
                ],
            });
        }

        if (rank >= statusRank("IN_USE") && !existingTypes.has("ON_SITE_CAPTURE")) {
            await insertScanEvent({
                orderId: order.id,
                assetId: primary.asset_id,
                scanType: "ON_SITE_CAPTURE",
                scannedBy: ctx.logisticsUser.id,
                quantity: 1,
                condition: null,
                note: "On-site setup complete and ready for activation.",
                media: [
                    {
                        url: mockImage("BE185D", `${order.order_id}\\nOn Site\\nAssembled`),
                        note: "Installed and client-ready",
                        kind: "ON_SITE",
                    },
                ],
            });
        }

        if (rank >= statusRank("DERIG") && !existingTypes.has("DERIG_CAPTURE")) {
            await insertScanEvent({
                orderId: order.id,
                assetId: primary.asset_id,
                scanType: "DERIG_CAPTURE",
                scannedBy: ctx.logisticsUser.id,
                quantity: 1,
                condition: null,
                note: "Derig notes and condition captured before return loading.",
                media: [
                    {
                        url: mockImage("7E22CE", `${order.order_id}\\nDerig\\nCondition Capture`),
                        note: "Minor cosmetic marks recorded",
                        kind: "GENERAL",
                    },
                ],
            });
        }

        if (rank >= statusRank("RETURN_IN_TRANSIT") && !existingTypes.has("RETURN_TRUCK_PHOTOS")) {
            await insertScanEvent({
                orderId: order.id,
                assetId: primary.asset_id,
                scanType: "RETURN_TRUCK_PHOTOS",
                scannedBy: ctx.logisticsUser.id,
                quantity: 1,
                condition: null,
                note: "Return truck evidence captured before warehouse arrival.",
                media: [
                    {
                        url: mockImage("EA580C", `${order.order_id}\\nReturn Transit\\nTruck`),
                        note: "Return departure proof",
                        kind: "GENERAL",
                    },
                ],
            });
        }

        if (rank >= statusRank("CLOSED") && !existingTypes.has("INBOUND")) {
            await insertScanEvent({
                orderId: order.id,
                assetId: primary.asset_id,
                scanType: "INBOUND",
                scannedBy: ctx.logisticsUser.id,
                quantity: primary.quantity,
                condition: "ORANGE",
                note: "Inbound return complete with minor scuff documented.",
                discrepancy: "BROKEN",
                media: [
                    {
                        url: mockImage("475569", `${order.order_id}\\nReturn Wide 1`),
                        note: "Unloading wide shot",
                        kind: "RETURN_WIDE",
                    },
                    {
                        url: mockImage("334155", `${order.order_id}\\nReturn Wide 2`),
                        note: "Asset staging at warehouse",
                        kind: "RETURN_WIDE",
                    },
                    {
                        url: mockImage("F97316", `${order.order_id}\\nDamage Detail`),
                        note: "Minor panel scuff",
                        kind: "DAMAGE",
                    },
                ],
            });
        }
    }

    console.log("✓ Scan timeline coverage ensured for PR demo orders");
};

const ensureInboundCoverage = async (
    ctx: SeedContext,
    serviceTypes: Map<string, typeof schema.serviceTypes.$inferSelect>
) => {
    console.log("\n[7/7] Ensuring inbound/service-request demo coverage…");

    const existingInbound = await db
        .select({ request_status: schema.inboundRequests.request_status })
        .from(schema.inboundRequests)
        .where(
            and(
                eq(schema.inboundRequests.platform_id, ctx.platform.id),
                eq(schema.inboundRequests.company_id, ctx.company.id)
            )
        );

    const existingInboundStatuses = new Set(existingInbound.map((row) => row.request_status));
    const inboundRequired: Array<(typeof schema.inboundRequestStatusEnum.enumValues)[number]> = [
        "PRICING_REVIEW",
        "PENDING_APPROVAL",
        "QUOTED",
        "CONFIRMED",
        "COMPLETED",
    ];

    const assets = await pickDemoAssets(ctx);
    const chosenAsset = ensureValue(assets[0], "No assets available for inbound seeding");

    let createdInbound = 0;

    for (const status of inboundRequired) {
        if (existingInboundStatuses.has(status)) continue;

        const requestDbId = randomUUID();
        const requestId = `DIR-PR-${status.slice(0, 3)}-01`.slice(0, 20);
        const finalFinancial: FinancialStatus =
            status === "COMPLETED"
                ? "INVOICED"
                : status === "QUOTED"
                  ? "QUOTE_SENT"
                  : status === "CONFIRMED"
                    ? "QUOTE_ACCEPTED"
                    : "PENDING_QUOTE";

        const inboundLine: OrderLineSeed = {
            line_item_type: "CATALOG",
            billing_mode: "BILLABLE",
            category: "HANDLING",
            description: "Handling - In",
            quantity: "25.00",
            unit: serviceTypes.get("Handling - In")?.unit || "m3",
            unit_rate: String(serviceTypes.get("Handling - In")?.default_rate || "9.60"),
            total: (25 * Number(serviceTypes.get("Handling - In")?.default_rate || 9.6)).toFixed(2),
            service_type_id: serviceTypes.get("Handling - In")?.id || null,
            added_by: ctx.logisticsUser.id,
            client_price_visible: status === "QUOTED",
        };

        const breakdown = composeBreakdownLines({
            volume: 6.5,
            warehouseOpsRate: Number(ctx.company.warehouse_ops_rate),
            marginPercent: Number(ctx.company.platform_margin_percent),
            createdBy: ctx.adminUser.id,
            lineItems: [inboundLine],
        });

        const pricing = await createPriceRecord({
            platformId: ctx.platform.id,
            entityType: "INBOUND_REQUEST",
            entityId: requestDbId,
            marginPercent: Number(ctx.company.platform_margin_percent),
            vatPercent: Number(ctx.platform.vat_percent || 0),
            calculatedBy: ctx.adminUser.id,
            breakdownLines: breakdown,
        });

        const [inbound] = await db
            .insert(schema.inboundRequests)
            .values({
                id: requestDbId,
                inbound_request_id: requestId,
                platform_id: ctx.platform.id,
                company_id: ctx.company.id,
                created_by: ctx.clientUser.id,
                incoming_at: daysFromNow(3),
                note: `Demo inbound request in ${status} status`,
                request_status: status,
                financial_status: finalFinancial,
                request_pricing_id: pricing.id,
            })
            .returning();

        await db.insert(schema.inboundRequestItems).values({
            inbound_request_id: inbound.id,
            brand_id: null,
            name: `${chosenAsset.name} - Inbound Batch`,
            description: "Inbound demo item",
            category: chosenAsset.category,
            tracking_method: "BATCH",
            quantity: 12,
            packaging: "Palletized",
            weight_per_unit: chosenAsset.weight_per_unit,
            dimensions: { length: 120, width: 80, height: 140 },
            volume_per_unit: chosenAsset.volume_per_unit,
            handling_tags: ["Fragile"],
            images: [mockImage("0F766E", `${requestId}\\nInbound Item`)],
            asset_id: null,
        });

        const lineItemId = await lineItemIdGenerator(ctx.platform.id);
        await db.insert(schema.lineItems).values({
            platform_id: ctx.platform.id,
            order_id: null,
            inbound_request_id: inbound.id,
            service_request_id: null,
            line_item_id: lineItemId,
            purpose_type: "INBOUND_REQUEST",
            service_type_id: inboundLine.service_type_id,
            line_item_type: inboundLine.line_item_type,
            billing_mode: inboundLine.billing_mode,
            category: inboundLine.category,
            description: inboundLine.description,
            quantity: inboundLine.quantity,
            unit: inboundLine.unit,
            unit_rate: inboundLine.unit_rate,
            total: inboundLine.total,
            added_by: inboundLine.added_by,
            added_at: new Date(),
            notes: "Seeded inbound handling line",
            metadata: {},
            client_price_visible: status === "QUOTED",
            is_voided: false,
        });

        createdInbound += 1;
    }

    const existingServiceRequests = await db
        .select({
            request_status: schema.serviceRequests.request_status,
            commercial_status: schema.serviceRequests.commercial_status,
        })
        .from(schema.serviceRequests)
        .where(
            and(
                eq(schema.serviceRequests.platform_id, ctx.platform.id),
                eq(schema.serviceRequests.company_id, ctx.company.id)
            )
        );

    const hasSubmittedClientBillable = existingServiceRequests.some(
        (row) => row.request_status === "SUBMITTED" && row.commercial_status === "PENDING_QUOTE"
    );

    if (!hasSubmittedClientBillable) {
        const srDbId = randomUUID();
        const srPricing = await createPriceRecord({
            platformId: ctx.platform.id,
            entityType: "SERVICE_REQUEST",
            entityId: srDbId,
            marginPercent: Number(ctx.company.platform_margin_percent),
            vatPercent: Number(ctx.platform.vat_percent || 0),
            calculatedBy: ctx.adminUser.id,
            breakdownLines: composeBreakdownLines({
                volume: 0,
                warehouseOpsRate: 0,
                marginPercent: Number(ctx.company.platform_margin_percent),
                createdBy: ctx.adminUser.id,
                lineItems: [
                    {
                        line_item_type: "CATALOG",
                        billing_mode: "BILLABLE",
                        category: "RESKIN",
                        description: "Graphic refresh package",
                        quantity: "1.00",
                        unit: "unit",
                        unit_rate: "450.00",
                        total: "450.00",
                        service_type_id: null,
                        added_by: ctx.adminUser.id,
                        client_price_visible: true,
                    },
                ],
            }),
        });

        const [sr] = await db
            .insert(schema.serviceRequests)
            .values({
                id: srDbId,
                service_request_id: "DSR-PR-SUB-01",
                platform_id: ctx.platform.id,
                company_id: ctx.company.id,
                request_type: "RESKIN",
                billing_mode: "CLIENT_BILLABLE",
                link_mode: "STANDALONE",
                blocks_fulfillment: false,
                request_status: "SUBMITTED",
                commercial_status: "PENDING_QUOTE",
                title: "Demo Client Billable Reskin",
                description: "Seeded for walkthrough of client billable service request",
                related_asset_id: chosenAsset.id,
                related_order_id: null,
                related_order_item_id: null,
                request_pricing_id: srPricing.id,
                requested_start_at: daysFromNow(2),
                requested_due_at: daysFromNow(5),
                created_by: ctx.clientUser.id,
                photos: [mockImage("7C3AED", "SR Submitted\\nReference")],
                work_notes: "Awaiting commercial quote",
            })
            .returning();

        await db.insert(schema.serviceRequestItems).values({
            service_request_id: sr.id,
            asset_id: chosenAsset.id,
            asset_name: chosenAsset.name,
            quantity: 1,
            notes: "Client-requested branding update",
            refurb_days_estimate: 3,
        });

        await db.insert(schema.serviceRequestStatusHistory).values({
            service_request_id: sr.id,
            platform_id: ctx.platform.id,
            from_status: null,
            to_status: "SUBMITTED",
            note: "Demo service request created in submitted state",
            changed_by: ctx.clientUser.id,
            changed_at: new Date(),
        });
    }

    const conditionSeedAssets = assets.slice(0, 5);
    for (const [index, asset] of conditionSeedAssets.entries()) {
        await db.insert(schema.assetConditionHistory).values({
            platform_id: ctx.platform.id,
            asset_id: asset.id,
            condition: index % 2 === 0 ? "GREEN" : "ORANGE",
            notes:
                index % 2 === 0
                    ? "Asset passed post-event inspection"
                    : "Minor wear observed; maintenance follow-up scheduled",
            photos: [mockImage("475569", `${asset.name.slice(0, 24)}\\nCondition Snapshot`)],
            updated_by: ctx.logisticsUser.id,
            timestamp: new Date(),
        });
    }

    console.log(
        `✓ Inbound coverage updated (${createdInbound} new inbound requests), service request/story coverage confirmed.`
    );
};

const main = async () => {
    console.log("\n========================================");
    console.log("DEMO PR OVERLAY SEED");
    console.log("========================================\n");

    runBaseDemoSeed();
    const ctx = await loadContext();

    await ensureCompanyBaseOpsRate(ctx);
    await importPrAssets(ctx);
    const rfqServices = await upsertRfqServiceTypes(ctx);
    await ensureOrderStatusCoverage(ctx, rfqServices);
    await ensureScanCoverage(ctx);
    await ensureInboundCoverage(ctx, rfqServices);

    console.log("\n✅ Demo PR overlay complete.");
    console.log("\n🔑 Credentials (all password123):");
    console.log("  Admin:     admin@test.com");
    console.log("  Logistics: logistics@test.com");
    console.log("  PR Client: client@pernod-ricard.com");
    console.log("\n📌 Suggested checks:");
    console.log("  1) Admin Orders list filters by all statuses");
    console.log("  2) Warehouse scanning timeline includes all capture checkpoints");
    console.log("  3) Client quote breakdown hides NON_BILLABLE custom lines");
};

main().catch((error) => {
    console.error("\n❌ Demo PR overlay failed:", error);
    process.exit(1);
});
