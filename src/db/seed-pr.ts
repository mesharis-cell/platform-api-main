/**
 * PERNOD RICARD — PRODUCTION SETUP SEED
 *
 * Standalone seed for the Pernod Ricard environment.
 * Contains only operational essentials — no demo orders, fake scans, or test data.
 *
 * What's seeded:
 *   - Platform
 *   - Pernod Ricard company (only)
 *   - Countries & cities
 *   - Company domains
 *   - Warehouse + PR zones
 *   - Users (admin, logistics, PR client)
 *   - All PR brands (29)
 *   - Vehicle types, transport rates, service types
 *   - Notification rules
 *   - Assets (576 from thin-MVP bundle via seedPrAssets)
 *
 * Run: bun run db:seed:pr
 */

import { companyFeatures } from "../app/constants/common";
import { db } from "./index";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";
import { seedPrAssets } from "./scripts/seed-pr-assets";

// ============================================================
// STATE STORE
// ============================================================

const S = {
    platform: null as any,
    company: null as any, // Pernod Ricard only
    country: null as any,
    cities: [] as any[],
    users: [] as any[],
    warehouse: null as any,
    brands: [] as any[],
    zones: [] as any[],
    vehicleTypes: [] as any[],
};

const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
const brandLogo = (name: string) =>
    `https://placehold.co/400x200/2563eb/FFFFFF?text=${encodeURIComponent(name + "\\nLogo")}`;

// ============================================================
// CLEANUP
// ============================================================

async function cleanup() {
    console.log("🧹 Cleaning up existing data...");
    const safeDelete = async (label: string, fn: () => Promise<unknown>) => {
        try {
            await fn();
        } catch (error) {
            console.log(`  ↳ Skipping ${label}: ${(error as Error).message}`);
        }
    };

    try {
        await db.execute(
            sql`UPDATE transport_rates SET trip_type = 'ONE_WAY' WHERE trip_type = 'ADDITIONAL'`
        );
    } catch (_) {
        /* ignore */
    }

    await safeDelete("notification_logs", () => db.delete(schema.notificationLogs));
    await safeDelete("system_events", () => db.delete(schema.systemEvents));
    await safeDelete("notification_rules", () => db.delete(schema.notificationRules));
    await safeDelete("asset_versions", () => db.delete(schema.assetVersions));
    await safeDelete("asset_condition_history", () => db.delete(schema.assetConditionHistory));
    await safeDelete("scan_events", () => db.delete(schema.scanEvents));
    await safeDelete("financial_status_history", () => db.delete(schema.financialStatusHistory));
    await safeDelete("order_status_history", () => db.delete(schema.orderStatusHistory));
    await safeDelete("invoices", () => db.delete(schema.invoices));
    await safeDelete("asset_bookings", () => db.delete(schema.assetBookings));
    await safeDelete("line_items", () => db.delete(schema.lineItems));
    await safeDelete("service_request_status_history", () =>
        db.delete(schema.serviceRequestStatusHistory)
    );
    await safeDelete("service_request_items", () => db.delete(schema.serviceRequestItems));
    await safeDelete("service_requests", () => db.delete(schema.serviceRequests));
    await safeDelete("order_items", () => db.delete(schema.orderItems));
    await safeDelete("orders", () => db.delete(schema.orders));
    await safeDelete("inbound_request_items", () => db.delete(schema.inboundRequestItems));
    await safeDelete("inbound_requests", () => db.delete(schema.inboundRequests));
    await safeDelete("prices", () => db.delete(schema.prices));
    await safeDelete("collection_items", () => db.delete(schema.collectionItems));
    await safeDelete("collections", () => db.delete(schema.collections));
    await safeDelete("assets", () => db.delete(schema.assets));
    await safeDelete("service_types", () => db.delete(schema.serviceTypes));
    await safeDelete("transport_rates", () => db.delete(schema.transportRates));
    await safeDelete("self_booking_items", () => db.delete(schema.selfBookingItems));
    await safeDelete("self_bookings", () => db.delete(schema.selfBookings));
    await safeDelete("cities", () => db.delete(schema.cities));
    await safeDelete("countries", () => db.delete(schema.countries));
    await safeDelete("zones", () => db.delete(schema.zones));
    await safeDelete("brands", () => db.delete(schema.brands));
    await safeDelete("company_domains", () => db.delete(schema.companyDomains));
    await safeDelete("users", () => db.delete(schema.users));
    await safeDelete("companies", () => db.delete(schema.companies));
    await safeDelete("warehouses", () => db.delete(schema.warehouses));
    await safeDelete("vehicle_types", () => db.delete(schema.vehicleTypes));
    await safeDelete("platforms", () => db.delete(schema.platforms));
    console.log("✓ Cleanup complete\n");
}

// ============================================================
// INFRASTRUCTURE
// ============================================================

async function seedPlatform() {
    console.log("🌐 Seeding platform...");
    const [platform] = await db
        .insert(schema.platforms)
        .values({
            name: "Kadence",
            domain: "gameondevelopment.live",
            config: {},
            features: {},
        })
        .returning();
    S.platform = platform;
    console.log(`✓ Platform: ${platform.name}`);
}

async function seedCompany() {
    console.log("🏢 Seeding company...");
    const [company] = await db
        .insert(schema.companies)
        .values({
            platform_id: S.platform.id,
            name: "Pernod Ricard",
            domain: "pernod-ricard",
            settings: {
                branding: {
                    title: "Pernod Ricard Events",
                    logo_url: brandLogo("Pernod Ricard"),
                    primary_color: "#1B1464",
                    secondary_color: "#FFD700",
                },
            },
            features: companyFeatures,
            platform_margin_percent: "25.00",
            warehouse_ops_rate: "10.00",
            contact_email: "events@pernod-ricard.com",
            contact_phone: "+971-50-111-1111",
            is_active: true,
        })
        .returning();
    S.company = company;
    console.log(`✓ Company: ${company.name}`);
}

async function seedCountriesAndCities() {
    console.log("🌍 Seeding countries & cities...");
    const [country] = await db
        .insert(schema.countries)
        .values({ platform_id: S.platform.id, name: "United Arab Emirates" })
        .returning();
    S.country = country;

    const cityNames = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah"];
    const cities = await db
        .insert(schema.cities)
        .values(
            cityNames.map((name) => ({ platform_id: S.platform.id, country_id: country.id, name }))
        )
        .returning();
    S.cities = cities;
    console.log(`✓ 1 country, ${cities.length} cities`);
}

async function seedCompanyDomains() {
    console.log("🔗 Seeding company domains...");
    await db.insert(schema.companyDomains).values({
        platform_id: S.platform.id,
        company_id: S.company.id,
        hostname: "pernod-ricard.gameondevelopment.live",
        type: "VANITY" as const,
        is_verified: true,
        is_active: true,
    });
    console.log("✓ 1 company domain");
}

async function seedWarehouse() {
    console.log("🏭 Seeding warehouse...");
    const [wh] = await db
        .insert(schema.warehouses)
        .values({
            platform_id: S.platform.id,
            name: "PMG Main Warehouse",
            country: "UAE",
            city: "Dubai",
            address: "Al Quoz Industrial Area, Dubai, UAE",
            is_active: true,
        })
        .returning();
    S.warehouse = wh;
    console.log("✓ 1 warehouse");
}

async function seedUsers() {
    console.log("👥 Seeding users...");
    const pw = await hashPassword("password123");

    const allPerms = [
        "auth:*",
        "users:*",
        "companies:*",
        "brands:*",
        "warehouses:*",
        "zones:*",
        "pricing_tiers:*",
        "orders:*",
        "pricing:*",
        "invoices:*",
        "lifecycle:*",
        "notifications:*",
        "analytics:*",
        "system:*",
        "assets:*",
        "collections:*",
        "conditions:*",
        "inventory:*",
        "quotes:*",
        "scanning:*",
        "self_bookings:*",
        "service_request:*",
        "inbound_request:*",
        "calendar:*",
        "reports:*",
    ];
    const logisticsPerms = [
        "auth:*",
        "users:read",
        "companies:read",
        "brands:read",
        "warehouses:read",
        "zones:read",
        "assets:*",
        "collections:*",
        "orders:read",
        "orders:update",
        "orders:add_time_windows",
        "pricing:review",
        "pricing:adjust",
        "lifecycle:progress_status",
        "lifecycle:receive_notifications",
        "scanning:*",
        "inventory:*",
        "conditions:*",
        "inbound_request:*",
    ];
    const clientPerms = [
        "auth:*",
        "companies:read",
        "brands:read",
        "assets:read",
        "collections:read",
        "orders:create",
        "orders:read",
        "orders:update",
        "quotes:approve",
        "quotes:decline",
        "invoices:read",
        "invoices:download",
        "lifecycle:receive_notifications",
        "self_bookings:*",
    ];

    const users = await db
        .insert(schema.users)
        .values([
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Admin User",
                email: "admin@test.com",
                password: pw,
                role: "ADMIN" as const,
                permissions: allPerms,
                permission_template: "PLATFORM_ADMIN" as const,
                is_super_admin: true,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Logistics User",
                email: "logistics@test.com",
                password: pw,
                role: "LOGISTICS" as const,
                permissions: logisticsPerms,
                permission_template: "LOGISTICS_STAFF" as const,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: S.company.id,
                name: "Pernod Ricard Event Manager",
                email: "client@pernod-ricard.com",
                password: pw,
                role: "CLIENT" as const,
                permissions: clientPerms,
                permission_template: "CLIENT_USER" as const,
                is_active: true,
            },
        ])
        .returning();
    S.users = users;
    console.log(`✓ ${users.length} users`);
}

async function seedBrands() {
    console.log("🏷️  Seeding brands...");
    const prBrands = [
        { name: "Absolut", description: "Absolut Vodka activations" },
        { name: "Altos", description: "Altos Tequila brand activations" },
        { name: "Avion", description: "Avion Tequila brand activations" },
        { name: "Barracuda", description: "Barracuda venue brand assets" },
        { name: "Beefeater", description: "Beefeater Gin brand activations" },
        { name: "Blenders Pride", description: "Blenders Pride whisky activations" },
        { name: "Cedar's", description: "Cedar's non-alcoholic spirit activations" },
        { name: "Chivas Regal", description: "Chivas Regal whisky events" },
        { name: "General", description: "General / multi-use platform assets" },
        { name: "Havana Club", description: "Havana Club rum brand activations" },
        { name: "Jameson", description: "Jameson Irish Whiskey brand experiences" },
        { name: "Le Cercle", description: "Le Cercle brand assets" },
        { name: "Lillet", description: "Lillet aperitif brand activations" },
        { name: "Longitude 77", description: "Longitude 77 brand activations" },
        { name: "Longmorn", description: "Longmorn whisky brand activations" },
        { name: "Malfy", description: "Malfy Gin brand activations" },
        { name: "Martell", description: "Martell Cognac brand activations" },
        { name: "Moët", description: "Moët & Chandon champagne activations" },
        { name: "Monkey 47", description: "Monkey 47 Gin brand activations" },
        { name: "Multi-Brand", description: "Cross-brand and multi-brand activations" },
        { name: "Mumm", description: "Mumm champagne brand activations" },
        { name: "Perrier-Jouët", description: "Perrier-Jouët champagne brand activations" },
        { name: "Ricard", description: "Ricard pastis brand activations" },
        { name: "Royal Salute", description: "Royal Salute whisky brand activations" },
        { name: "Royal Stag", description: "Royal Stag whisky brand activations" },
        { name: "Sainte Marguerite", description: "Château Sainte Marguerite brand activations" },
        { name: "Sipsmith", description: "Sipsmith Gin brand activations" },
        { name: "The Glenlivet", description: "The Glenlivet whisky brand activations" },
        { name: "Unknown", description: "Unidentified / pending categorisation" },
    ].map((b) => ({
        platform_id: S.platform.id,
        company_id: S.company.id,
        logo_url: brandLogo(b.name),
        is_active: true,
        ...b,
    }));

    const brands = await db.insert(schema.brands).values(prBrands).returning();
    S.brands = brands;
    console.log(`✓ ${brands.length} brands`);
}

async function seedZones() {
    console.log("📦 Seeding zones...");
    const zones = await db
        .insert(schema.zones)
        .values([
            {
                platform_id: S.platform.id,
                warehouse_id: S.warehouse.id,
                company_id: S.company.id,
                name: "PR-A",
                description: "Pernod Ricard primary zone",
                capacity: 1000,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                warehouse_id: S.warehouse.id,
                company_id: S.company.id,
                name: "PR-B",
                description: "Pernod Ricard overflow zone",
                capacity: 500,
                is_active: true,
            },
        ])
        .returning();
    S.zones = zones;
    console.log(`✓ ${zones.length} zones`);
}

async function seedVehicleTypes() {
    console.log("🚛 Seeding vehicle types...");
    const types = await db
        .insert(schema.vehicleTypes)
        .values([
            {
                name: "Standard Truck",
                vehicle_size: "15",
                platform_id: S.platform.id,
                description: "Standard delivery truck",
                is_default: true,
                display_order: 1,
            },
            {
                name: "7 Ton Truck",
                vehicle_size: "40",
                platform_id: S.platform.id,
                description: "Large truck up to 7 tons",
                is_default: false,
                display_order: 2,
            },
            {
                name: "10 Ton Truck",
                vehicle_size: "60",
                platform_id: S.platform.id,
                description: "Extra large truck up to 10 tons",
                is_default: false,
                display_order: 3,
            },
        ])
        .returning();
    S.vehicleTypes = types;
    console.log(`✓ ${types.length} vehicle types`);
}

async function seedTransportRates() {
    console.log("🚚 Seeding transport rates...");
    const trips: ("ONE_WAY" | "ROUND_TRIP")[] = ["ONE_WAY", "ROUND_TRIP"];
    const rates: any[] = [];
    for (const city of S.cities) {
        for (const trip of trips) {
            for (const vt of S.vehicleTypes) {
                const base =
                    vt.name === "Standard Truck" ? 500 : vt.name === "7 Ton Truck" ? 800 : 1200;
                rates.push({
                    platform_id: S.platform.id,
                    company_id: null,
                    city_id: city.id,
                    area: null,
                    trip_type: trip,
                    vehicle_type_id: vt.id,
                    rate: (base * (trip === "ROUND_TRIP" ? 1.8 : 1)).toString(),
                    is_active: true,
                });
            }
        }
    }
    await db.insert(schema.transportRates).values(rates);
    console.log(`✓ ${rates.length} transport rates`);
}

async function seedServiceTypes() {
    console.log("🛠️  Seeding service types...");
    const pid = S.platform.id;
    const services = [
        {
            name: "Basic Assembly",
            category: "ASSEMBLY" as const,
            unit: "hour",
            default_rate: "75.00",
        },
        {
            name: "Complex Assembly",
            category: "ASSEMBLY" as const,
            unit: "hour",
            default_rate: "120.00",
        },
        {
            name: "Forklift Operation",
            category: "EQUIPMENT" as const,
            unit: "hour",
            default_rate: "200.00",
        },
        {
            name: "Loading / Unloading",
            category: "HANDLING" as const,
            unit: "hour",
            default_rate: "60.00",
        },
        {
            name: "Fragile Item Handling",
            category: "HANDLING" as const,
            unit: "unit",
            default_rate: "25.00",
        },
        { name: "Vinyl Wrap", category: "RESKIN" as const, unit: "unit", default_rate: "300.00" },
        { name: "Storage Fee", category: "OTHER" as const, unit: "day", default_rate: "50.00" },
        {
            name: "Cleaning Service",
            category: "OTHER" as const,
            unit: "unit",
            default_rate: "35.00",
        },
    ];
    await db
        .insert(schema.serviceTypes)
        .values(
            services.map((s, i) => ({ platform_id: pid, ...s, display_order: i, is_active: true }))
        );
    console.log(`✓ ${services.length} service types`);
}

async function seedNotificationRules() {
    console.log("🔔 Seeding notification rules...");
    const pid = S.platform.id;
    type RuleDef = {
        event_type: string;
        recipient_type: "ROLE" | "ENTITY_OWNER" | "EMAIL";
        recipient_value: string | null;
        template_key: string;
        sort_order: number;
    };
    const rules: RuleDef[] = [
        {
            event_type: "order.submitted",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_submitted_client",
            sort_order: 0,
        },
        {
            event_type: "order.submitted",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_submitted_admin",
            sort_order: 1,
        },
        {
            event_type: "order.submitted",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_submitted_logistics",
            sort_order: 2,
        },
        {
            event_type: "quote.sent",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "quote_sent_client",
            sort_order: 0,
        },
        {
            event_type: "quote.sent",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "quote_sent_admin",
            sort_order: 1,
        },
        {
            event_type: "quote.revised",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "quote_revised_client",
            sort_order: 0,
        },
        {
            event_type: "order.confirmed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_confirmed_client",
            sort_order: 0,
        },
        {
            event_type: "order.confirmed",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_confirmed_logistics",
            sort_order: 1,
        },
        {
            event_type: "order.delivered",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_delivered_client",
            sort_order: 0,
        },
        {
            event_type: "order.closed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_closed_client",
            sort_order: 0,
        },
        {
            event_type: "service_request.created",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "service_request_created_admin",
            sort_order: 0,
        },
        {
            event_type: "service_request.completed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "service_request_completed_client",
            sort_order: 0,
        },
        {
            event_type: "inbound_request.completed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "inbound_request_completed_admin",
            sort_order: 0,
        },
    ];
    await db
        .insert(schema.notificationRules)
        .values(rules.map((r) => ({ platform_id: pid, is_active: true, ...r })));
    console.log(`✓ ${rules.length} notification rules`);
}

// ============================================================
// MAIN
// ============================================================

console.log("\n========================================");
console.log("PERNOD RICARD — PRODUCTION SETUP SEED");
console.log("========================================\n");

async function main() {
    try {
        console.log("🚀 Starting PR seed...\n");

        await cleanup();

        // Phase 1: Infrastructure
        await seedPlatform();
        await seedCompany();
        await seedCountriesAndCities();
        await seedCompanyDomains();
        await seedWarehouse();
        await seedUsers();
        await seedBrands();
        await seedZones();

        // Phase 2: Operational config
        await seedVehicleTypes();
        await seedTransportRates();
        await seedServiceTypes();
        await seedNotificationRules();

        // Phase 3: PR assets from thin-MVP bundle
        await seedPrAssets({
            platformId: S.platform.id,
            companyId: S.company.id,
            warehouseId: S.warehouse.id,
            zoneId: S.zones[0].id,
            verbose: true,
        });

        console.log("\n✅ PR SEED COMPLETE!\n");
        console.log("📊 Summary:");
        console.log(`  Platform : ${S.platform.name}`);
        console.log(`  Company  : ${S.company.name}`);
        console.log(`  Users    : ${S.users.length}`);
        console.log(`    admin@test.com / password123`);
        console.log(`    logistics@test.com / password123`);
        console.log(`    client@pernod-ricard.com / password123`);
        console.log(`  Brands   : ${S.brands.length}`);
        console.log(`  Warehouse: ${S.warehouse.name}`);
        console.log(`  Zones    : ${S.zones.length}`);
        console.log();
        process.exit(0);
    } catch (err) {
        console.error("❌ Seed failed:", err);
        process.exit(1);
    }
}

main();
