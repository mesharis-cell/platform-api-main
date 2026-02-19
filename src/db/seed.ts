/**
 * DEMO-READY DATABASE SEED
 *
 * Single platform: gameondevelopment.live
 * Two companies: Pernod Ricard + Diageo
 * Deterministic QR codes (survive re-seeds)
 * Explicit demo-ready orders at required statuses
 * Inbound requests at various statuses
 *
 * Run: tsx src/db/seed.ts
 */

import { companyFeatures } from "../app/constants/common";
import { lineItemIdGenerator } from "../app/modules/order-line-items/order-line-items.utils";
import { db } from "./index";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";

// ============================================================
// TYPE ALIASES
// ============================================================
type TrackingMethod = "INDIVIDUAL" | "BATCH";
type AssetCondition = "GREEN" | "ORANGE" | "RED";
type ScanType = "OUTBOUND" | "INBOUND";
type OrderStatus =
    | "DRAFT"
    | "SUBMITTED"
    | "PRICING_REVIEW"
    | "PENDING_APPROVAL"
    | "QUOTED"
    | "DECLINED"
    | "CONFIRMED"
    | "AWAITING_FABRICATION"
    | "IN_PREPARATION"
    | "READY_FOR_DELIVERY"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "IN_USE"
    | "AWAITING_RETURN"
    | "RETURN_IN_TRANSIT"
    | "CLOSED"
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

// ============================================================
// HELPERS
// ============================================================
const hashPassword = async (pw: string) => bcrypt.hash(pw, 10);

const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

const generateAssetImages = (category: string, name: string, count = 3): string[] => {
    const colors: Record<string, string[]> = {
        Furniture: ["8B4513", "654321", "A0522D"],
        Glassware: ["4682B4", "87CEEB", "B0E0E6"],
        Installation: ["696969", "808080", "A9A9A9"],
        Decor: ["FF69B4", "FFB6C1", "FFC0CB"],
        Lighting: ["FFD700", "FFA500", "FFFF00"],
    };
    const c = colors[category] || ["CCCCCC", "999999", "666666"];
    const views = ["Front", "Side", "Detail"];
    return Array.from({ length: count }, (_, i) => {
        const text = `${category}\\n${name.slice(0, 18)}\\n(${views[i]})`;
        return `https://placehold.co/800x600/${c[i % c.length]}/FFFFFF?text=${encodeURIComponent(text)}`;
    });
};

const brandLogo = (name: string) =>
    `https://placehold.co/400x200/2563eb/FFFFFF?text=${encodeURIComponent(name + "\\nLogo")}`;

// ============================================================
// SEEDED DATA STORE (cross-referencing)
// ============================================================
const S = {
    platform: null as any,
    companies: [] as any[],
    country: null as any,
    cities: [] as any[],
    users: [] as any[],
    warehouses: [] as any[],
    brands: [] as any[],
    zones: [] as any[],
    vehicleTypes: [] as any[],
    transportRates: [] as any[],
    serviceTypes: [] as any[],
    assets: [] as any[],
    collections: [] as any[],
    orders: [] as any[],
    orderItems: [] as any[],
    lineItems: [] as any[],
    inboundRequests: [] as any[],
    serviceRequests: [] as any[],
};

// Helper to find records
const companyByName = (name: string) => S.companies.find((c) => c.name === name)!;
const userByEmail = (email: string) => S.users.find((u) => u.email === email)!;
const brandByName = (name: string) => S.brands.find((b) => b.name === name)!;
const zoneForCompany = (companyId: string) => S.zones.find((z) => z.company_id === companyId)!;
const cityByName = (name: string) => S.cities.find((c) => c.name === name)!;

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function seedPlatform() {
    console.log("🌐 Seeding platform...");
    const [platform] = await db
        .insert(schema.platforms)
        .values({
            name: "Game On Development",
            domain: "gameondevelopment.live",
            config: {
                logo_url: "https://placehold.co/200x80/f97316/ffffff?text=Game+On",
                primary_color: "#f97316",
                secondary_color: "#0ea5e9",
                logistics_partner_name: "A2 Logistics",
                support_email: "support@gameondevelopment.live",
                currency: "AED",
                feasibility: {
                    minimum_lead_hours: 24,
                    exclude_weekends: true,
                    weekend_days: [0, 6],
                    timezone: "Asia/Dubai",
                },
            },
            features: {
                collections: true,
                bulk_import: true,
                advanced_reporting: true,
                api_access: true,
                ...companyFeatures,
            },
            is_active: true,
        })
        .returning();
    S.platform = platform;
    console.log(`✓ Platform: ${platform.name} (${platform.domain})`);
}

async function seedCompanies() {
    console.log("🏢 Seeding companies...");
    const pid = S.platform.id;
    const companies = await db
        .insert(schema.companies)
        .values([
            {
                platform_id: pid,
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
            },
            {
                platform_id: pid,
                name: "Diageo",
                domain: "diageo",
                settings: {
                    branding: {
                        title: "Diageo Experiences",
                        logo_url: brandLogo("Diageo"),
                        primary_color: "#8B0000",
                        secondary_color: "#FFD700",
                    },
                },
                features: companyFeatures,
                platform_margin_percent: "22.00",
                warehouse_ops_rate: "12.00",
                contact_email: "events@diageo.com",
                contact_phone: "+971-50-222-2222",
                is_active: true,
            },
        ])
        .returning();
    S.companies = companies;
    console.log(`✓ ${companies.length} companies`);
}

async function seedCountriesAndCities() {
    console.log("🌍 Seeding countries & cities...");
    const pid = S.platform.id;
    const [country] = await db
        .insert(schema.countries)
        .values({ platform_id: pid, name: "United Arab Emirates" })
        .returning();
    S.country = country;

    const cityNames = [
        "Dubai",
        "Abu Dhabi",
        "Sharjah",
        "Ajman",
        "Ras Al Khaimah",
        "Fujairah",
        "Umm Al Quwain",
    ];
    const cities = await db
        .insert(schema.cities)
        .values(cityNames.map((name) => ({ platform_id: pid, country_id: country.id, name })))
        .returning();
    S.cities = cities;
    console.log(`✓ 1 country, ${cities.length} cities`);
}

async function seedCompanyDomains() {
    console.log("🔗 Seeding company domains...");
    const domains = S.companies.map((c) => ({
        platform_id: S.platform.id,
        company_id: c.id,
        hostname: `${c.domain}.gameondevelopment.live`,
        type: "VANITY" as const,
        is_verified: true,
        is_active: true,
    }));
    await db.insert(schema.companyDomains).values(domains);
    console.log(`✓ ${domains.length} company domains`);
}

async function seedWarehouses() {
    console.log("🏭 Seeding warehouses...");
    const [wh] = await db
        .insert(schema.warehouses)
        .values({
            platform_id: S.platform.id,
            name: "Dubai Main Warehouse",
            country: "United Arab Emirates",
            city: "Dubai",
            address: "Dubai Industrial City, Plot 598-1234",
            coordinates: { lat: 25.0657, lng: 55.1713 },
            is_active: true,
        })
        .returning();
    S.warehouses = [wh];
    console.log(`✓ 1 warehouse`);
}

async function seedUsers() {
    console.log("👥 Seeding users...");
    const pid = S.platform.id;
    const pw = await hashPassword("password123");
    const pr = companyByName("Pernod Ricard");
    const dg = companyByName("Diageo");

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
    ];

    const users = await db
        .insert(schema.users)
        .values([
            {
                platform_id: pid,
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
                platform_id: pid,
                company_id: null,
                name: "Sarah Johnson",
                email: "sarah.admin@platform.com",
                password: pw,
                role: "ADMIN" as const,
                permissions: allPerms,
                permission_template: "PLATFORM_ADMIN" as const,
                is_active: true,
            },
            {
                platform_id: pid,
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
                platform_id: pid,
                company_id: null,
                name: "Ahmed Al-Rashid",
                email: "ahmed.logistics@a2logistics.com",
                password: pw,
                role: "LOGISTICS" as const,
                permissions: logisticsPerms,
                permission_template: "LOGISTICS_STAFF" as const,
                is_active: true,
            },
            {
                platform_id: pid,
                company_id: pr.id,
                name: "Pernod Ricard Event Manager",
                email: "client@pernod-ricard.com",
                password: pw,
                role: "CLIENT" as const,
                permissions: clientPerms,
                permission_template: "CLIENT_USER" as const,
                is_active: true,
            },
            {
                platform_id: pid,
                company_id: dg.id,
                name: "Diageo Event Manager",
                email: "client@diageo.com",
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
    const pid = S.platform.id;
    const pr = companyByName("Pernod Ricard");
    const dg = companyByName("Diageo");

    const brands = await db
        .insert(schema.brands)
        .values([
            {
                platform_id: pid,
                company_id: pr.id,
                name: "Absolut",
                description: "Absolut Vodka activations",
                logo_url: brandLogo("Absolut"),
                is_active: true,
            },
            {
                platform_id: pid,
                company_id: pr.id,
                name: "Chivas Regal",
                description: "Chivas Regal events",
                logo_url: brandLogo("Chivas Regal"),
                is_active: true,
            },
            {
                platform_id: pid,
                company_id: pr.id,
                name: "Jameson",
                description: "Jameson brand experiences",
                logo_url: brandLogo("Jameson"),
                is_active: true,
            },
            {
                platform_id: pid,
                company_id: dg.id,
                name: "Johnnie Walker",
                description: "Johnnie Walker activations",
                logo_url: brandLogo("Johnnie Walker"),
                is_active: true,
            },
            {
                platform_id: pid,
                company_id: dg.id,
                name: "Guinness",
                description: "Guinness experiences",
                logo_url: brandLogo("Guinness"),
                is_active: true,
            },
            {
                platform_id: pid,
                company_id: dg.id,
                name: "Baileys",
                description: "Baileys brand events",
                logo_url: brandLogo("Baileys"),
                is_active: true,
            },
        ])
        .returning();
    S.brands = brands;
    console.log(`✓ ${brands.length} brands`);
}

async function seedZones() {
    console.log("📦 Seeding zones...");
    const pid = S.platform.id;
    const wh = S.warehouses[0];

    const zones = await db
        .insert(schema.zones)
        .values(
            S.companies.flatMap((c) => [
                {
                    platform_id: pid,
                    warehouse_id: wh.id,
                    company_id: c.id,
                    name: `${c.name.substring(0, 3).toUpperCase()}-A`,
                    description: `${c.name} primary zone`,
                    capacity: 500,
                    is_active: true,
                },
                {
                    platform_id: pid,
                    warehouse_id: wh.id,
                    company_id: c.id,
                    name: `${c.name.substring(0, 3).toUpperCase()}-B`,
                    description: `${c.name} overflow zone`,
                    capacity: 300,
                    is_active: true,
                },
            ])
        )
        .returning();
    S.zones = zones;
    console.log(`✓ ${zones.length} zones`);
}

async function seedVehicleTypes() {
    console.log("🚛 Seeding vehicle types...");
    const pid = S.platform.id;
    const types = await db
        .insert(schema.vehicleTypes)
        .values([
            {
                name: "Standard Truck",
                vehicle_size: "15",
                platform_id: pid,
                description: "Standard delivery truck",
                is_default: true,
                display_order: 1,
            },
            {
                name: "7 Ton Truck",
                vehicle_size: "40",
                platform_id: pid,
                description: "Large truck up to 7 tons",
                is_default: false,
                display_order: 2,
            },
            {
                name: "10 Ton Truck",
                vehicle_size: "60",
                platform_id: pid,
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
    const pid = S.platform.id;
    const trips: ("ONE_WAY" | "ROUND_TRIP")[] = ["ONE_WAY", "ROUND_TRIP"];
    const rates: any[] = [];

    for (const city of S.cities) {
        for (const trip of trips) {
            for (const vt of S.vehicleTypes) {
                const base =
                    vt.name === "Standard Truck" ? 500 : vt.name === "7 Ton Truck" ? 800 : 1200;
                const mult = trip === "ROUND_TRIP" ? 1.8 : 1;
                rates.push({
                    platform_id: pid,
                    company_id: null,
                    city_id: city.id,
                    area: null,
                    trip_type: trip,
                    vehicle_type_id: vt.id,
                    rate: (base * mult).toString(),
                    is_active: true,
                });
            }
        }
    }

    const inserted = await db.insert(schema.transportRates).values(rates).returning();
    S.transportRates = inserted;
    console.log(`✓ ${inserted.length} transport rates`);
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
            description: "Standard furniture assembly",
        },
        {
            name: "Complex Setup",
            category: "ASSEMBLY" as const,
            unit: "hour",
            default_rate: "120.00",
            description: "Complex installations and setups",
        },
        {
            name: "Rigging Services",
            category: "ASSEMBLY" as const,
            unit: "hour",
            default_rate: "150.00",
            description: "Professional rigging and suspension",
        },
        {
            name: "Forklift Operation",
            category: "EQUIPMENT" as const,
            unit: "hour",
            default_rate: "200.00",
            description: "Forklift and heavy equipment operation",
        },
        {
            name: "Loading/Unloading",
            category: "HANDLING" as const,
            unit: "hour",
            default_rate: "60.00",
            description: "Manual loading and unloading",
        },
        {
            name: "Fragile Item Handling",
            category: "HANDLING" as const,
            unit: "unit",
            default_rate: "25.00",
            description: "Special handling for fragile items",
        },
        {
            name: "White Glove Service",
            category: "HANDLING" as const,
            unit: "trip",
            default_rate: "500.00",
            description: "Premium handling and setup service",
        },
        {
            name: "Vinyl Wrap Application",
            category: "RESKIN" as const,
            unit: "unit",
            default_rate: "300.00",
            description: "Custom vinyl wrapping for furniture",
        },
        {
            name: "Graphic Installation",
            category: "RESKIN" as const,
            unit: "unit",
            default_rate: "150.00",
            description: "Installation of custom graphics",
        },
        {
            name: "Storage Fee",
            category: "OTHER" as const,
            unit: "day",
            default_rate: "50.00",
            description: "Daily storage charge",
        },
        {
            name: "Rush Service",
            category: "OTHER" as const,
            unit: "trip",
            default_rate: "750.00",
            description: "Expedited delivery/pickup",
        },
        {
            name: "Cleaning Service",
            category: "OTHER" as const,
            unit: "unit",
            default_rate: "35.00",
            description: "Deep cleaning of returned items",
        },
    ];
    const baseServices = await db
        .insert(schema.serviceTypes)
        .values(
            services.map((s, i) => ({
                platform_id: pid,
                ...s,
                display_order: i,
                is_active: true,
            }))
        )
        .returning();

    const defaultVehicle = S.vehicleTypes.find((v: any) => v.is_default) || S.vehicleTypes[0];
    const cityNameById = new Map(S.cities.map((city: any) => [city.id, city.name]));
    const transportServiceRows = S.transportRates
        .filter(
            (rate: any) => rate.company_id === null && rate.vehicle_type_id === defaultVehicle?.id
        )
        .map((rate: any, idx: number) => {
            const cityName = cityNameById.get(rate.city_id) || "Unknown City";
            const tripLabel = rate.trip_type === "ROUND_TRIP" ? "Round Trip" : "One Way";
            return {
                platform_id: pid,
                name: `Transport - ${cityName} (${tripLabel})`,
                category: "TRANSPORT" as const,
                unit: "trip",
                default_rate: rate.rate,
                default_metadata: {
                    city_id: rate.city_id,
                    city_name: cityName,
                    trip_direction: rate.trip_type,
                    vehicle_type_id: rate.vehicle_type_id,
                    vehicle_type_name: defaultVehicle?.name || null,
                },
                transport_rate_id: rate.id,
                description: `Transport service synced from ${cityName} ${tripLabel} rate card`,
                display_order: services.length + idx,
                is_active: true,
            };
        });

    const transportServices =
        transportServiceRows.length > 0
            ? await db.insert(schema.serviceTypes).values(transportServiceRows).returning()
            : [];

    S.serviceTypes = [...baseServices, ...transportServices];
    console.log(
        `✓ ${S.serviceTypes.length} service types (${baseServices.length} base + ${transportServices.length} transport)`
    );
}

// ============================================================
// ASSETS — Deterministic QR codes
// ============================================================
async function seedAssets() {
    console.log("🎨 Seeding assets (deterministic QR codes)...");
    const pid = S.platform.id;
    const wh = S.warehouses[0];

    // Asset templates per category
    const templates: Record<
        string,
        Array<{
            name: string;
            desc: string;
            weight: number;
            dims: { length: number; width: number; height: number };
            volume: number;
            tracking: TrackingMethod;
            qty: number;
        }>
    > = {
        Furniture: [
            {
                name: "Executive Round Table",
                desc: "Premium 6-seater round table",
                weight: 45,
                dims: { length: 150, width: 150, height: 75 },
                volume: 1.688,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Chiavari Gold Chair",
                desc: "Classic gold chiavari chair",
                weight: 5.5,
                dims: { length: 40, width: 45, height: 90 },
                volume: 0.162,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Velvet Lounge Sofa",
                desc: "3-seater luxury velvet sofa",
                weight: 65,
                dims: { length: 210, width: 90, height: 85 },
                volume: 1.606,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Bar Stool High",
                desc: "Modern metal bar stool",
                weight: 8,
                dims: { length: 45, width: 45, height: 110 },
                volume: 0.223,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Cocktail Table Round",
                desc: "High-top cocktail table",
                weight: 18,
                dims: { length: 80, width: 80, height: 110 },
                volume: 0.704,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Banquet Rectangle Table",
                desc: "8-seater rectangular table",
                weight: 52,
                dims: { length: 240, width: 100, height: 75 },
                volume: 1.8,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
        ],
        Glassware: [
            {
                name: "Wine Glass Bordeaux",
                desc: "Premium crystal wine glass",
                weight: 0.25,
                dims: { length: 10, width: 10, height: 24 },
                volume: 0.002,
                tracking: "BATCH",
                qty: 60,
            },
            {
                name: "Champagne Flute",
                desc: "Elegant champagne flute",
                weight: 0.22,
                dims: { length: 8, width: 8, height: 26 },
                volume: 0.002,
                tracking: "BATCH",
                qty: 80,
            },
            {
                name: "Whisky Tumbler",
                desc: "Heavy base whisky glass",
                weight: 0.35,
                dims: { length: 9, width: 9, height: 10 },
                volume: 0.001,
                tracking: "BATCH",
                qty: 50,
            },
        ],
        Installation: [
            {
                name: "Backdrop Frame 4x3m",
                desc: "Aluminum photo backdrop frame",
                weight: 28,
                dims: { length: 400, width: 10, height: 300 },
                volume: 1.2,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Pipe and Drape System",
                desc: "3m high drape system per 3m",
                weight: 15,
                dims: { length: 300, width: 10, height: 300 },
                volume: 0.9,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Red Carpet Runner 10m",
                desc: "VIP red carpet runner",
                weight: 18,
                dims: { length: 1000, width: 120, height: 2 },
                volume: 0.24,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
        ],
        Decor: [
            {
                name: "Floral Centerpiece Luxury",
                desc: "Premium floral arrangement",
                weight: 3.5,
                dims: { length: 40, width: 40, height: 50 },
                volume: 0.08,
                tracking: "BATCH",
                qty: 30,
            },
            {
                name: "LED Uplighter RGB",
                desc: "Wireless RGB uplight",
                weight: 2.8,
                dims: { length: 15, width: 15, height: 30 },
                volume: 0.007,
                tracking: "BATCH",
                qty: 40,
            },
            {
                name: "Neon Sign Custom",
                desc: "Custom LED neon sign",
                weight: 5,
                dims: { length: 120, width: 10, height: 60 },
                volume: 0.072,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
        ],
        Lighting: [
            {
                name: "Par LED Moving Head",
                desc: "Professional moving head light",
                weight: 12,
                dims: { length: 30, width: 30, height: 45 },
                volume: 0.041,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Wash Light Bar",
                desc: "4-head LED wash bar",
                weight: 8.5,
                dims: { length: 120, width: 15, height: 20 },
                volume: 0.036,
                tracking: "INDIVIDUAL",
                qty: 1,
            },
            {
                name: "Fairy Lights 20m",
                desc: "Warm white fairy light string",
                weight: 0.8,
                dims: { length: 2000, width: 5, height: 5 },
                volume: 0.05,
                tracking: "BATCH",
                qty: 25,
            },
        ],
    };

    const companyAbbr: Record<string, string> = { "Pernod Ricard": "PR", Diageo: "DG" };
    const catAbbr: Record<string, string> = {
        Furniture: "FURN",
        Glassware: "GLASS",
        Installation: "INST",
        Decor: "DECOR",
        Lighting: "LIGHT",
    };

    const allAssets: any[] = [];
    for (const company of S.companies) {
        const abbr = companyAbbr[company.name] || company.name.substring(0, 2).toUpperCase();
        const companyBrands = S.brands.filter((b) => b.company_id === company.id);
        const zone = zoneForCompany(company.id);
        let catCounters: Record<string, number> = {};

        for (const [category, items] of Object.entries(templates)) {
            const ca = catAbbr[category] || category.substring(0, 4).toUpperCase();
            catCounters[ca] = catCounters[ca] || 0;

            for (const t of items) {
                catCounters[ca]++;
                const idx = String(catCounters[ca]).padStart(3, "0");
                const qrCode = `QR-${abbr}-${ca}-${idx}`;

                // Assign brand based on pattern: first brand for first 2 items, second for next 2, etc.
                const brandIdx = Math.floor((catCounters[ca] - 1) / 2) % companyBrands.length;
                const brand = companyBrands[brandIdx] || null;

                // Condition: mostly GREEN, a couple ORANGE, one RED per company
                let condition: AssetCondition = "GREEN";
                let status: "AVAILABLE" | "BOOKED" | "OUT" | "MAINTENANCE" = "AVAILABLE";
                let conditionNotes: string | null = null;
                let refurbDays: number | null = null;

                // Make specific assets non-green for demo
                if (category === "Furniture" && catCounters[ca] === 5) {
                    condition = "ORANGE";
                    conditionNotes = "Minor scratch on surface, still functional";
                    refurbDays = 2;
                }
                if (category === "Furniture" && catCounters[ca] === 6) {
                    condition = "RED";
                    conditionNotes = "Leg damaged during transport, needs repair";
                    refurbDays = 5;
                    status = "AVAILABLE";
                }

                const handlingTags =
                    category === "Glassware"
                        ? ["Fragile", "HighValue"]
                        : category === "Furniture" && t.weight > 50
                          ? ["HeavyLift"]
                          : category === "Installation"
                            ? ["AssemblyRequired"]
                            : [];

                allAssets.push({
                    platform_id: pid,
                    company_id: company.id,
                    warehouse_id: wh.id,
                    zone_id: zone.id,
                    brand_id: brand?.id || null,
                    name: `${t.name}${brand ? ` - ${brand.name}` : ""}`,
                    description: t.desc,
                    category,
                    images: generateAssetImages(category, t.name, 3),
                    on_display_image: generateAssetImages(category, `${t.name} On Display`, 1)[0],
                    tracking_method: t.tracking,
                    total_quantity: t.qty,
                    available_quantity: t.qty,
                    qr_code: qrCode,
                    packaging: t.tracking === "BATCH" ? "Plastic crate 60x40x30cm" : null,
                    weight_per_unit: t.weight.toString(),
                    dimensions: t.dims,
                    volume_per_unit: t.volume.toString(),
                    condition,
                    condition_notes: conditionNotes,
                    refurb_days_estimate: refurbDays,
                    handling_tags: handlingTags,
                    status,
                    last_scanned_at: null,
                    last_scanned_by: null,
                    transformed_from: null,
                    transformed_to: null,
                });
            }
        }
    }

    const inserted = await db.insert(schema.assets).values(allAssets).returning();
    S.assets = inserted;
    console.log(`✓ ${inserted.length} assets with deterministic QR codes`);
}

async function seedCollections() {
    console.log("📚 Seeding collections...");
    const pid = S.platform.id;

    const collTemplates = [
        {
            name: "Executive Dinner Setup",
            desc: "Complete setup for executive dinners",
            category: "Dining",
        },
        {
            name: "Cocktail Reception Package",
            desc: "Full cocktail event setup",
            category: "Cocktail",
        },
        { name: "VIP Lounge Collection", desc: "Premium lounge furniture set", category: "Lounge" },
    ];

    const colls: any[] = [];
    for (const company of S.companies) {
        const companyBrands = S.brands.filter((b) => b.company_id === company.id);
        for (let i = 0; i < collTemplates.length; i++) {
            const t = collTemplates[i];
            const brand = companyBrands[i % companyBrands.length];
            const name = `${t.name} - ${brand.name}`;
            colls.push({
                platform_id: pid,
                company_id: company.id,
                brand_id: brand.id,
                name,
                description: t.desc,
                images: [
                    `https://placehold.co/1200x800/059669/FFFFFF?text=${encodeURIComponent(name.slice(0, 28) + "\\nSetup")}`,
                    `https://placehold.co/1200x800/0891b2/FFFFFF?text=${encodeURIComponent(name.slice(0, 28) + "\\nDetail")}`,
                ],
                category: t.category,
                is_active: true,
            });
        }
    }

    const inserted = await db.insert(schema.collections).values(colls).returning();
    S.collections = inserted;

    // Link collection items
    const items: any[] = [];
    for (const coll of inserted) {
        const companyAssets = S.assets.filter((a) => a.company_id === coll.company_id).slice(0, 5);
        companyAssets.forEach((asset, idx) => {
            items.push({
                collection: coll.id,
                asset: asset.id,
                default_quantity: asset.tracking_method === "BATCH" ? 5 : 1,
                notes: idx === 0 ? "Featured item" : null,
                display_order: idx,
            });
        });
    }
    await db.insert(schema.collectionItems).values(items);
    console.log(`✓ ${inserted.length} collections, ${items.length} collection items`);
}

// ============================================================
// ORDERS — Explicit demo-ready
// ============================================================

async function createPricing(opts: {
    volume: number;
    warehouseOpsRate: number;
    marginPercent: number;
    catalogTotal?: number;
    customTotal?: number;
    userId: string;
}) {
    const baseOps = opts.volume * opts.warehouseOpsRate;
    const catTotal = opts.catalogTotal || 0;
    const custTotal = opts.customTotal || 0;
    const logSub = baseOps + catTotal + custTotal;
    const marginAmt = logSub * (opts.marginPercent / 100);
    const finalTotal = logSub + marginAmt;

    const [price] = await db
        .insert(schema.prices)
        .values({
            platform_id: S.platform.id,
            warehouse_ops_rate: opts.warehouseOpsRate.toFixed(2),
            base_ops_total: baseOps.toFixed(2),
            logistics_sub_total: logSub.toFixed(2),
            transport: { system_rate: 0, final_rate: 0 },
            line_items: { catalog_total: catTotal, custom_total: custTotal },
            margin: {
                percent: opts.marginPercent,
                amount: marginAmt,
                is_override: false,
                override_reason: null,
            },
            final_total: finalTotal.toFixed(2),
            calculated_at: new Date(),
            calculated_by: opts.userId,
        })
        .returning();
    return price;
}

async function createServiceRequestPricing(opts: {
    company: any;
    catalogTotal: number;
    customTotal: number;
    userId: string;
}) {
    const marginPercent = parseFloat(opts.company.platform_margin_percent || "0");
    const logisticsSubTotal = opts.catalogTotal + opts.customTotal;
    const marginAmount = logisticsSubTotal * (marginPercent / 100);
    const finalTotal = logisticsSubTotal + marginAmount;

    const [price] = await db
        .insert(schema.prices)
        .values({
            platform_id: S.platform.id,
            warehouse_ops_rate: "0.00",
            base_ops_total: "0.00",
            logistics_sub_total: logisticsSubTotal.toFixed(2),
            transport: { system_rate: 0, final_rate: 0 },
            line_items: { catalog_total: opts.catalogTotal, custom_total: opts.customTotal },
            margin: {
                percent: marginPercent,
                amount: marginAmount,
                is_override: false,
                override_reason: null,
            },
            final_total: finalTotal.toFixed(2),
            calculated_at: new Date(),
            calculated_by: opts.userId,
        })
        .returning();

    return price;
}

async function seedOrders() {
    console.log("🛒 Seeding demo orders...");
    const pid = S.platform.id;
    const pr = companyByName("Pernod Ricard");
    const dg = companyByName("Diageo");
    const prClient = userByEmail("client@pernod-ricard.com");
    const dgClient = userByEmail("client@diageo.com");
    const dubai = cityByName("Dubai");
    const abuDhabi = cityByName("Abu Dhabi");
    const defaultVehicle = S.vehicleTypes.find((v: any) => v.is_default) || S.vehicleTypes[0];
    const transportRateByCity = new Map(
        S.transportRates
            .filter(
                (rate: any) =>
                    rate.company_id === null &&
                    rate.vehicle_type_id === defaultVehicle?.id &&
                    rate.trip_type === "ROUND_TRIP"
            )
            .map((rate: any) => [rate.city_id, parseFloat(rate.rate)])
    );

    // -------- ORDER DEFINITIONS --------
    const orderDefs = [
        // --- Pernod Ricard Orders ---
        {
            orderId: "ORD-20260212-001",
            company: pr,
            user: prClient,
            brand: brandByName("Absolut"),
            status: "PRICING_REVIEW" as OrderStatus,
            financial: "PENDING_QUOTE" as FinancialStatus,
            venue: "Dubai World Trade Centre",
            cityId: dubai.id,
            eventStart: daysFromNow(14),
            eventEnd: daysFromNow(16),
            jobNumber: null,
            volume: 12.5,
            marginPercent: 25,
            instructions:
                "Setup must be complete by 6 PM the day before event. Service entrance at rear.",
            label: "Scenario 1: Pricing review",
        },
        {
            orderId: "ORD-20260210-002",
            company: pr,
            user: prClient,
            brand: brandByName("Chivas Regal"),
            status: "CONFIRMED" as OrderStatus,
            financial: "QUOTE_ACCEPTED" as FinancialStatus,
            venue: "Atlantis The Palm",
            cityId: dubai.id,
            eventStart: daysFromNow(10),
            eventEnd: daysFromNow(12),
            jobNumber: "JOB-2026-0002",
            volume: 8.2,
            marginPercent: 25,
            instructions: "VIP event — premium handling required.",
            label: "Scenario 2a: Ready for fulfillment",
        },
        {
            orderId: "ORD-20260208-003",
            company: pr,
            user: prClient,
            brand: brandByName("Jameson"),
            status: "IN_PREPARATION" as OrderStatus,
            financial: "QUOTE_ACCEPTED" as FinancialStatus,
            venue: "Burj Al Arab",
            cityId: dubai.id,
            eventStart: daysFromNow(7),
            eventEnd: daysFromNow(9),
            jobNumber: "JOB-2026-0003",
            volume: 5.6,
            marginPercent: 25,
            instructions: "Fragile items — double-wrap glassware.",
            label: "Scenario 2b: Live outbound scanning",
        },
        {
            orderId: "ORD-20260201-004",
            company: pr,
            user: prClient,
            brand: brandByName("Absolut"),
            status: "AWAITING_RETURN" as OrderStatus,
            financial: "PAID" as FinancialStatus,
            venue: "Emirates Palace",
            cityId: abuDhabi.id,
            eventStart: daysFromNow(-4),
            eventEnd: daysFromNow(-1),
            jobNumber: "JOB-2026-0004",
            volume: 10.0,
            marginPercent: 25,
            instructions: "Post-event cleanup included.",
            label: "Scenario 3: Live inbound scanning",
        },
        {
            orderId: "ORD-20260115-005",
            company: pr,
            user: prClient,
            brand: brandByName("Chivas Regal"),
            status: "CLOSED" as OrderStatus,
            financial: "PAID" as FinancialStatus,
            venue: "Address Downtown",
            cityId: dubai.id,
            eventStart: daysFromNow(-15),
            eventEnd: daysFromNow(-10),
            jobNumber: "JOB-2026-0005",
            volume: 7.3,
            marginPercent: 25,
            instructions: null,
            label: "Completed lifecycle example",
        },
        // --- Diageo Orders ---
        {
            orderId: "ORD-20260211-006",
            company: dg,
            user: dgClient,
            brand: brandByName("Johnnie Walker"),
            status: "QUOTED" as OrderStatus,
            financial: "QUOTE_REVISED" as FinancialStatus,
            venue: "JW Marriott Marquis",
            cityId: dubai.id,
            eventStart: daysFromNow(20),
            eventEnd: daysFromNow(22),
            jobNumber: null,
            volume: 9.5,
            marginPercent: 22,
            instructions: "Premium whisky tasting setup. Handle with care.",
            label: "Waiting for client approval",
        },
        {
            orderId: "ORD-20260205-007",
            company: dg,
            user: dgClient,
            brand: brandByName("Guinness"),
            status: "DELIVERED" as OrderStatus,
            financial: "INVOICED" as FinancialStatus,
            venue: "Dubai World Trade Centre",
            cityId: dubai.id,
            eventStart: daysFromNow(-1),
            eventEnd: daysFromNow(2),
            jobNumber: "JOB-2026-0007",
            volume: 11.0,
            marginPercent: 22,
            instructions: "Festival setup — outdoor area.",
            label: "Currently at venue",
        },
        {
            orderId: "ORD-20260209-008",
            company: dg,
            user: dgClient,
            brand: brandByName("Baileys"),
            status: "AWAITING_FABRICATION" as OrderStatus,
            financial: "QUOTE_ACCEPTED" as FinancialStatus,
            venue: "Atlantis The Palm",
            cityId: dubai.id,
            eventStart: daysFromNow(25),
            eventEnd: daysFromNow(27),
            jobNumber: "JOB-2026-0008",
            volume: 6.0,
            marginPercent: 22,
            instructions: "Custom Baileys branding on all furniture pieces.",
            label: "Service work in progress",
        },
        {
            orderId: "ORD-20260203-009",
            company: dg,
            user: dgClient,
            brand: brandByName("Guinness"),
            status: "RETURN_IN_TRANSIT" as OrderStatus,
            financial: "PAID" as FinancialStatus,
            venue: "Expo City Dubai",
            cityId: dubai.id,
            eventStart: daysFromNow(-3),
            eventEnd: daysFromNow(-1),
            jobNumber: "JOB-2026-0009",
            volume: 9.1,
            marginPercent: 22,
            instructions: "Return convoy includes 1 extra site-access vehicle.",
            label: "Return in transit",
        },
    ];

    for (const def of orderDefs) {
        const warehouseOpsRate = parseFloat(def.company.warehouse_ops_rate);
        const transportRate = transportRateByCity.get(def.cityId) || 500;
        const catalogTotal = ["PRICING_REVIEW", "DRAFT"].includes(def.status)
            ? 0
            : Number((150 + transportRate).toFixed(2));
        const customTotal = def.orderId === "ORD-20260209-008" ? 1500 : 0;

        const pricing = await createPricing({
            volume: def.volume,
            warehouseOpsRate,
            marginPercent: def.marginPercent,
            catalogTotal,
            customTotal,
            userId: def.user.id,
        });

        const [order] = await db
            .insert(schema.orders)
            .values({
                platform_id: pid,
                order_id: def.orderId,
                company_id: def.company.id,
                brand_id: def.brand?.id || null,
                created_by: def.user.id,
                job_number: def.jobNumber,
                contact_name: def.user.name,
                contact_email: def.user.email,
                contact_phone: def.company.contact_phone,
                event_start_date: def.eventStart,
                event_end_date: def.eventEnd,
                venue_name: def.venue,
                venue_city_id: def.cityId,
                venue_location: {
                    country: "United Arab Emirates",
                    address: `${def.venue}, Main Hall`,
                    access_notes:
                        "Service entrance at rear of building. Contact security upon arrival.",
                },
                special_instructions: def.instructions,
                delivery_window: def.jobNumber
                    ? {
                          start: new Date(def.eventStart.getTime() - 24 * 3600000),
                          end: new Date(def.eventStart.getTime() - 12 * 3600000),
                      }
                    : null,
                pickup_window: ["AWAITING_RETURN", "RETURN_IN_TRANSIT", "CLOSED"].includes(
                    def.status
                )
                    ? {
                          start: new Date(def.eventEnd.getTime() + 12 * 3600000),
                          end: new Date(def.eventEnd.getTime() + 36 * 3600000),
                      }
                    : null,
                calculated_totals: {
                    volume: def.volume.toFixed(3),
                    weight: (def.volume * 120).toFixed(2),
                },
                order_pricing_id: pricing.id,
                order_status: def.status,
                financial_status: def.financial,
                scanning_data: {},
                delivery_photos: [
                    "DELIVERED",
                    "AWAITING_RETURN",
                    "RETURN_IN_TRANSIT",
                    "CLOSED",
                ].includes(def.status)
                    ? [
                          `https://placehold.co/800x600/475569/FFFFFF?text=${encodeURIComponent("Delivery\\nLoading")}`,
                      ]
                    : [],
            })
            .returning();

        S.orders.push({
            ...order,
            _label: def.label,
            _companyName: def.company.name,
        });
    }

    console.log(`✓ ${S.orders.length} demo orders`);
    S.orders.forEach((o: any) => console.log(`  ${o.order_id} [${o.order_status}] — ${o._label}`));
}

// ============================================================
// ORDER ITEMS — Specific assets for scanning demos
// ============================================================

async function seedOrderItems() {
    console.log("📦 Seeding order items...");

    for (const order of S.orders) {
        const companyAssets = S.assets.filter((a: any) => a.company_id === order.company_id);
        const furnitureAssets = companyAssets.filter(
            (a: any) => a.category === "Furniture" && a.condition === "GREEN"
        );
        const orangeFurnitureAsset = companyAssets.find(
            (a: any) => a.category === "Furniture" && a.condition === "ORANGE"
        );
        const redFurnitureAsset = companyAssets.find(
            (a: any) => a.category === "Furniture" && a.condition === "RED"
        );
        const glasswareAssets = companyAssets.filter((a: any) => a.category === "Glassware");
        const installAssets = companyAssets.filter((a: any) => a.category === "Installation");

        // Pick items based on order purpose
        let selectedItems: Array<{
            asset: any;
            qty: number;
            maintenanceDecision?: "FIX_IN_ORDER" | "USE_AS_IS" | null;
        }> = [];

        if (order.order_id === "ORD-20260208-003") {
            // IN_PREPARATION — for live outbound scanning: 2 individual + 1 batch
            selectedItems = [
                { asset: furnitureAssets[0], qty: 1 },
                { asset: furnitureAssets[1], qty: 1 },
                { asset: glasswareAssets[0], qty: 10 },
            ];
        } else if (order.order_id === "ORD-20260212-001") {
            // PRICING_REVIEW — maintenance-decision scenarios:
            // ORANGE still pending decision + RED mandatory fix
            selectedItems = [
                { asset: orangeFurnitureAsset, qty: 1, maintenanceDecision: null },
                { asset: redFurnitureAsset, qty: 1 },
                { asset: glasswareAssets[0], qty: 8 },
            ];
        } else if (order.order_id === "ORD-20260210-002") {
            // CONFIRMED — ORANGE chosen as USE_AS_IS
            selectedItems = [
                { asset: furnitureAssets[0], qty: 1 },
                { asset: orangeFurnitureAsset, qty: 1, maintenanceDecision: "USE_AS_IS" },
                { asset: glasswareAssets[0], qty: 12 },
            ];
        } else if (order.order_id === "ORD-20260211-006") {
            // QUOTED (revised) — ORANGE chosen as FIX_IN_ORDER
            selectedItems = [
                { asset: furnitureAssets[0], qty: 1 },
                { asset: orangeFurnitureAsset, qty: 1, maintenanceDecision: "FIX_IN_ORDER" },
                { asset: glasswareAssets[0], qty: 10 },
            ];
        } else if (order.order_id === "ORD-20260201-004") {
            // AWAITING_RETURN — for live inbound scanning: 3 individual + 1 batch
            selectedItems = [
                { asset: furnitureAssets[0], qty: 1 },
                { asset: furnitureAssets[1], qty: 1 },
                { asset: furnitureAssets[2], qty: 1 },
                { asset: glasswareAssets[0], qty: 15 },
            ];
        } else {
            // Standard mix: 2 furniture + 1 glass + 1 other
            selectedItems = [
                { asset: furnitureAssets[0], qty: 1 },
                { asset: furnitureAssets[1], qty: 1 },
                { asset: glasswareAssets[0], qty: 12 },
                ...(installAssets.length > 0 ? [{ asset: installAssets[0], qty: 1 }] : []),
            ];
        }

        for (const item of selectedItems) {
            if (!item.asset) continue;
            const a = item.asset;
            const vol = parseFloat(a.volume_per_unit);
            const wt = parseFloat(a.weight_per_unit);
            const assetCondition = a.condition as AssetCondition;
            const maintenanceDecision =
                assetCondition === "RED" ? "FIX_IN_ORDER" : (item.maintenanceDecision ?? null);
            const requiresMaintenance =
                assetCondition === "RED" || maintenanceDecision === "FIX_IN_ORDER";
            const maintenanceRefurbDaysSnapshot = requiresMaintenance
                ? Number(a.refurb_days_estimate || 0)
                : null;
            const maintenanceDecisionLockedAt = maintenanceDecision
                ? new Date(order.created_at.getTime() + 18 * 3600000)
                : null;

            const [oi] = await db
                .insert(schema.orderItems)
                .values({
                    platform_id: S.platform.id,
                    order_id: order.id,
                    asset_id: a.id,
                    asset_name: a.name,
                    quantity: item.qty,
                    volume_per_unit: a.volume_per_unit,
                    weight_per_unit: a.weight_per_unit,
                    total_volume: (vol * item.qty).toFixed(3),
                    total_weight: (wt * item.qty).toFixed(2),
                    condition_notes:
                        assetCondition === "GREEN" ? null : (a.condition_notes ?? null),
                    handling_tags: a.handling_tags,
                    from_collection: null,
                    from_collection_name: null,
                    maintenance_decision: maintenanceDecision,
                    requires_maintenance: requiresMaintenance,
                    maintenance_refurb_days_snapshot: maintenanceRefurbDaysSnapshot,
                    maintenance_decision_locked_at: maintenanceDecisionLockedAt,
                })
                .returning();
            S.orderItems.push(oi);
        }
    }
    console.log(`✓ ${S.orderItems.length} order items`);
}

// ============================================================
// LINE ITEMS
// ============================================================

async function seedLineItems() {
    console.log("💰 Seeding order line items...");
    const admin = userByEmail("admin@test.com");
    const logistics = userByEmail("logistics@test.com");
    const transportServices = S.serviceTypes.filter(
        (service: any) => service.category === "TRANSPORT" && service.default_rate
    );

    for (const order of S.orders) {
        // Skip early-stage orders
        if (["DRAFT", "PRICING_REVIEW"].includes(order.order_status)) continue;

        const catalogServices = S.serviceTypes.filter((s: any) => s.default_rate);

        // Add a catalog line item (assembly service)
        const svc = catalogServices[0]; // Basic Assembly
        if (svc) {
            const lineItemId = await lineItemIdGenerator(S.platform.id);
            const qty = 2;
            const total = (qty * parseFloat(svc.default_rate)).toFixed(2);
            const [li] = await db
                .insert(schema.lineItems)
                .values({
                    platform_id: S.platform.id,
                    order_id: order.id,
                    inbound_request_id: null,
                    line_item_id: lineItemId,
                    purpose_type: "ORDER" as const,
                    service_type_id: svc.id,
                    line_item_type: "CATALOG" as const,
                    category: svc.category,
                    description: svc.name,
                    quantity: qty.toString(),
                    unit: svc.unit,
                    unit_rate: svc.default_rate,
                    total,
                    billing_mode: "BILLABLE" as const,
                    added_by: logistics.id,
                    added_at: new Date(order.created_at.getTime() + 24 * 3600000),
                    notes: null,
                    metadata: {},
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(li);
        }

        const transportService =
            transportServices.find((service: any) => {
                const metadata = (service.default_metadata || {}) as Record<string, unknown>;
                return (
                    metadata.city_id === order.venue_city_id &&
                    metadata.trip_direction === "ROUND_TRIP"
                );
            }) ||
            transportServices.find((service: any) => {
                const metadata = (service.default_metadata || {}) as Record<string, unknown>;
                return metadata.city_id === order.venue_city_id;
            }) ||
            transportServices[0];

        if (transportService) {
            const lineItemId = await lineItemIdGenerator(S.platform.id);
            const total = parseFloat(transportService.default_rate).toFixed(2);
            const [transportLine] = await db
                .insert(schema.lineItems)
                .values({
                    platform_id: S.platform.id,
                    order_id: order.id,
                    inbound_request_id: null,
                    line_item_id: lineItemId,
                    purpose_type: "ORDER" as const,
                    service_type_id: transportService.id,
                    line_item_type: "CATALOG" as const,
                    category: "TRANSPORT" as const,
                    description: transportService.name,
                    quantity: "1",
                    unit: transportService.unit,
                    unit_rate: transportService.default_rate,
                    total,
                    billing_mode: "BILLABLE" as const,
                    added_by: logistics.id,
                    added_at: new Date(order.created_at.getTime() + 26 * 3600000),
                    notes: "Transport prepared during pricing review",
                    metadata: {
                        ...(transportService.default_metadata || {}),
                        truck_plate: `DXB-${String(order.order_id).slice(-4)}`,
                        driver_name: "Assigned Driver",
                        driver_contact: "+971500001111",
                    },
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(transportLine);
        }

        if (order.order_id === "ORD-20260208-003") {
            const lineItemId = await lineItemIdGenerator(S.platform.id);
            const [nonBillableTransport] = await db
                .insert(schema.lineItems)
                .values({
                    platform_id: S.platform.id,
                    order_id: order.id,
                    inbound_request_id: null,
                    line_item_id: lineItemId,
                    purpose_type: "ORDER" as const,
                    service_type_id: null,
                    line_item_type: "CUSTOM" as const,
                    category: "TRANSPORT" as const,
                    description: "Site access escort vehicle",
                    quantity: "1",
                    unit: "trip",
                    unit_rate: "120.00",
                    total: "120.00",
                    billing_mode: "NON_BILLABLE" as const,
                    added_by: logistics.id,
                    added_at: new Date(order.created_at.getTime() + 28 * 3600000),
                    notes: "Operational support only",
                    metadata: {
                        truck_plate: "AUX-7788",
                        driver_name: "Site Access Team",
                        trip_direction: "ONE_WAY",
                    },
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(nonBillableTransport);
        }

        if (order.order_id === "ORD-20260211-006") {
            const lineItemId = await lineItemIdGenerator(S.platform.id);
            const [complimentaryLine] = await db
                .insert(schema.lineItems)
                .values({
                    platform_id: S.platform.id,
                    order_id: order.id,
                    inbound_request_id: null,
                    line_item_id: lineItemId,
                    purpose_type: "ORDER" as const,
                    service_type_id: null,
                    line_item_type: "CUSTOM" as const,
                    category: "OTHER" as const,
                    description: "Complimentary loading buffer",
                    quantity: "1",
                    unit: "trip",
                    unit_rate: "80.00",
                    total: "80.00",
                    billing_mode: "COMPLIMENTARY" as const,
                    added_by: admin.id,
                    added_at: new Date(order.created_at.getTime() + 30 * 3600000),
                    notes: "Commercial goodwill adjustment",
                    metadata: { reason: "client_retention" },
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(complimentaryLine);
        }
    }
    console.log(`✓ ${S.lineItems.length} line items`);
}

// ============================================================
// SERVICE REQUESTS — standalone operational/commercial flows
// ============================================================
async function seedServiceRequests() {
    console.log("🧰 Seeding service requests...");
    const pid = S.platform.id;
    const admin = userByEmail("admin@test.com");
    const logistics = userByEmail("logistics@test.com");
    const pr = companyByName("Pernod Ricard");
    const dg = companyByName("Diageo");

    const prOrange = S.assets.find(
        (asset: any) =>
            asset.company_id === pr.id &&
            asset.category === "Furniture" &&
            asset.condition === "ORANGE"
    );
    const prRed = S.assets.find(
        (asset: any) =>
            asset.company_id === pr.id &&
            asset.category === "Furniture" &&
            asset.condition === "RED"
    );
    const dgOrange = S.assets.find(
        (asset: any) =>
            asset.company_id === dg.id &&
            asset.category === "Furniture" &&
            asset.condition === "ORANGE"
    );
    const dgRed = S.assets.find(
        (asset: any) =>
            asset.company_id === dg.id &&
            asset.category === "Furniture" &&
            asset.condition === "RED"
    );

    const linkedOrder = S.orders.find((order: any) => order.order_id === "ORD-20260209-008");
    const linkedOrderItem = S.orderItems.find((item: any) => item.order_id === linkedOrder?.id);

    const getServiceTypeByName = (name: string) => {
        const svc = S.serviceTypes.find((service: any) => service.name === name);
        if (!svc) throw new Error(`Missing service type in seed data: ${name}`);
        return svc;
    };

    const defs = [
        {
            service_request_id: "SR-20260214-001",
            company: pr,
            request_type: "MAINTENANCE" as const,
            billing_mode: "INTERNAL_ONLY" as const,
            request_status: "IN_PROGRESS" as const,
            commercial_status: "INTERNAL" as const,
            title: "Standalone maintenance for orange + red lounge furniture",
            description:
                "Operational fix request not tied directly to an order. Keep items in visible pool while execution is tracked.",
            related_asset_id: prOrange?.id || null,
            related_order_id: null,
            related_order_item_id: null,
            requested_start_at: daysFromNow(1),
            requested_due_at: daysFromNow(4),
            created_by: logistics.id,
            created_at: daysFromNow(-2),
            updated_at: daysFromNow(-1),
            completed_at: null,
            completed_by: null,
            completion_notes: null,
            cancelled_at: null,
            cancelled_by: null,
            cancellation_reason: null,
            status_path: ["SUBMITTED", "IN_REVIEW", "APPROVED", "IN_PROGRESS"] as const,
            status_actor_id: logistics.id,
            commercial_notes: ["Internal-only request, no client quote required."],
            commercial_actor_id: admin.id,
            items: [
                {
                    asset_id: prOrange?.id || null,
                    asset_name: prOrange?.name || "PR Orange Furniture",
                    quantity: 1,
                    notes: "Minor scratches and edge polish",
                    refurb_days_estimate: 2,
                },
                {
                    asset_id: prRed?.id || null,
                    asset_name: prRed?.name || "PR Red Furniture",
                    quantity: 1,
                    notes: "Structural leg repair and repaint",
                    refurb_days_estimate: 5,
                },
            ],
            catalog_items: [
                {
                    service_name: "Cleaning Service",
                    quantity: 2,
                    notes: "Post-repair deep clean",
                    added_by: logistics.id,
                },
            ],
            custom_items: [
                {
                    category: "HANDLING" as const,
                    description: "Sanding and touch-up material pack",
                    total: 180,
                    notes: "Internal consumables",
                    added_by: logistics.id,
                },
            ],
        },
        {
            service_request_id: "SR-20260213-002",
            company: dg,
            request_type: "RESKIN" as const,
            billing_mode: "CLIENT_BILLABLE" as const,
            request_status: "APPROVED" as const,
            commercial_status: "QUOTED" as const,
            title: "Standalone service package for launch assets",
            description:
                "Standalone service request with commercial quote sent to client before execution starts.",
            related_asset_id: dgOrange?.id || null,
            related_order_id: linkedOrder?.id || null,
            related_order_item_id: linkedOrderItem?.id || null,
            requested_start_at: daysFromNow(2),
            requested_due_at: daysFromNow(8),
            created_by: admin.id,
            created_at: daysFromNow(-3),
            updated_at: daysFromNow(-1),
            completed_at: null,
            completed_by: null,
            completion_notes: null,
            cancelled_at: null,
            cancelled_by: null,
            cancellation_reason: null,
            status_path: ["SUBMITTED", "IN_REVIEW", "APPROVED"] as const,
            status_actor_id: admin.id,
            commercial_notes: [
                "Commercial status changed to PENDING_QUOTE",
                "Commercial status changed to QUOTED",
            ],
            commercial_actor_id: admin.id,
            items: [
                {
                    asset_id: dgOrange?.id || null,
                    asset_name: dgOrange?.name || "DG Orange Furniture",
                    quantity: 1,
                    notes: "Client requested refreshed vinyl wrap",
                    refurb_days_estimate: 3,
                },
            ],
            catalog_items: [
                {
                    service_name: "Vinyl Wrap Application",
                    quantity: 2,
                    notes: "Apply to outer shell and front fascia",
                    added_by: admin.id,
                },
            ],
            custom_items: [
                {
                    category: "RESKIN" as const,
                    description: "Artwork prepress and proofing setup",
                    total: 420,
                    notes: "One-time setup charge",
                    added_by: admin.id,
                },
            ],
        },
        {
            service_request_id: "SR-20260207-003",
            company: pr,
            request_type: "REFURBISHMENT" as const,
            billing_mode: "CLIENT_BILLABLE" as const,
            request_status: "COMPLETED" as const,
            commercial_status: "PAID" as const,
            title: "Completed refurbishment pack for premium lounge set",
            description:
                "Historical completed standalone refurbishment with approved quote, invoice, and payment.",
            related_asset_id: prRed?.id || null,
            related_order_id: null,
            related_order_item_id: null,
            requested_start_at: daysFromNow(-9),
            requested_due_at: daysFromNow(-5),
            created_by: logistics.id,
            created_at: daysFromNow(-10),
            updated_at: daysFromNow(-2),
            completed_at: daysFromNow(-2),
            completed_by: logistics.id,
            completion_notes: "Refurbishment completed and quality checks passed.",
            cancelled_at: null,
            cancelled_by: null,
            cancellation_reason: null,
            status_path: [
                "SUBMITTED",
                "IN_REVIEW",
                "APPROVED",
                "IN_PROGRESS",
                "COMPLETED",
            ] as const,
            status_actor_id: logistics.id,
            commercial_notes: [
                "Commercial status changed to PENDING_QUOTE",
                "Commercial status changed to QUOTED",
                "Commercial status changed to QUOTE_APPROVED",
                "Commercial status changed to INVOICED",
                "Commercial status changed to PAID",
            ],
            commercial_actor_id: admin.id,
            items: [
                {
                    asset_id: prRed?.id || null,
                    asset_name: prRed?.name || "PR Red Furniture",
                    quantity: 1,
                    notes: "Full structural and finish refurbishment",
                    refurb_days_estimate: 5,
                },
            ],
            catalog_items: [
                {
                    service_name: "Basic Assembly",
                    quantity: 4,
                    notes: "Refit after repair",
                    added_by: logistics.id,
                },
            ],
            custom_items: [
                {
                    category: "OTHER" as const,
                    description: "Refurbishment labor and replacement parts",
                    total: 960,
                    notes: "Includes hardware replacement",
                    added_by: admin.id,
                },
            ],
        },
        {
            service_request_id: "SR-20260205-004",
            company: dg,
            request_type: "CUSTOM" as const,
            billing_mode: "INTERNAL_ONLY" as const,
            request_status: "CANCELLED" as const,
            commercial_status: "CANCELLED" as const,
            title: "Cancelled custom maintenance bundle",
            description: "Request cancelled after scope moved to a separate operational plan.",
            related_asset_id: dgRed?.id || null,
            related_order_id: null,
            related_order_item_id: null,
            requested_start_at: daysFromNow(-4),
            requested_due_at: daysFromNow(1),
            created_by: admin.id,
            created_at: daysFromNow(-6),
            updated_at: daysFromNow(-1),
            completed_at: null,
            completed_by: null,
            completion_notes: null,
            cancelled_at: daysFromNow(-1),
            cancelled_by: admin.id,
            cancellation_reason: "Merged into direct order-based execution plan before kickoff.",
            status_path: ["SUBMITTED", "IN_REVIEW", "CANCELLED"] as const,
            status_actor_id: admin.id,
            commercial_notes: ["Request cancelled before commercial processing."],
            commercial_actor_id: admin.id,
            items: [
                {
                    asset_id: dgRed?.id || null,
                    asset_name: dgRed?.name || "DG Red Furniture",
                    quantity: 1,
                    notes: "Initial request was wheel replacement + repaint",
                    refurb_days_estimate: 4,
                },
            ],
            catalog_items: [],
            custom_items: [],
        },
    ];

    for (const def of defs) {
        const catalogTotal = def.catalog_items.reduce((sum, item) => {
            const svc = getServiceTypeByName(item.service_name);
            return sum + Number(svc.default_rate || 0) * item.quantity;
        }, 0);
        const customTotal = def.custom_items.reduce((sum, item) => sum + item.total, 0);
        const pricing =
            def.billing_mode === "CLIENT_BILLABLE"
                ? await createServiceRequestPricing({
                      company: def.company,
                      catalogTotal,
                      customTotal,
                      userId: def.created_by,
                  })
                : null;

        const [serviceRequest] = await db
            .insert(schema.serviceRequests)
            .values({
                service_request_id: def.service_request_id,
                platform_id: pid,
                company_id: def.company.id,
                request_type: def.request_type,
                billing_mode: def.billing_mode,
                request_status: def.request_status,
                commercial_status: def.commercial_status,
                title: def.title,
                description: def.description,
                related_asset_id: def.related_asset_id,
                related_order_id: def.related_order_id,
                related_order_item_id: def.related_order_item_id,
                request_pricing_id: pricing?.id || null,
                requested_start_at: def.requested_start_at,
                requested_due_at: def.requested_due_at,
                created_by: def.created_by,
                completed_at: def.completed_at,
                completed_by: def.completed_by,
                completion_notes: def.completion_notes,
                cancelled_at: def.cancelled_at,
                cancelled_by: def.cancelled_by,
                cancellation_reason: def.cancellation_reason,
                created_at: def.created_at,
                updated_at: def.updated_at,
            })
            .returning();

        S.serviceRequests.push(serviceRequest);

        if (def.items.length > 0) {
            await db.insert(schema.serviceRequestItems).values(
                def.items.map((item) => ({
                    service_request_id: serviceRequest.id,
                    asset_id: item.asset_id,
                    asset_name: item.asset_name,
                    quantity: item.quantity,
                    notes: item.notes,
                    refurb_days_estimate: item.refurb_days_estimate,
                    created_at: def.created_at,
                    updated_at: def.updated_at,
                }))
            );
        }

        for (let i = 0; i < def.status_path.length; i++) {
            const toStatus = def.status_path[i];
            const fromStatus = i === 0 ? null : def.status_path[i - 1];
            await db.insert(schema.serviceRequestStatusHistory).values({
                service_request_id: serviceRequest.id,
                platform_id: pid,
                from_status: fromStatus as any,
                to_status: toStatus as any,
                note:
                    i === 0
                        ? "Service request created"
                        : `Operational status moved to ${String(toStatus).replace(/_/g, " ")}`,
                changed_by: def.status_actor_id,
                changed_at: new Date(def.created_at.getTime() + i * 6 * 3600000),
            });
        }

        for (let i = 0; i < def.commercial_notes.length; i++) {
            await db.insert(schema.serviceRequestStatusHistory).values({
                service_request_id: serviceRequest.id,
                platform_id: pid,
                from_status: def.request_status as any,
                to_status: def.request_status as any,
                note: def.commercial_notes[i],
                changed_by: def.commercial_actor_id,
                changed_at: new Date(def.updated_at.getTime() + i * 3600000),
            });
        }

        for (const catalogItem of def.catalog_items) {
            const serviceType = getServiceTypeByName(catalogItem.service_name);
            const lineItemId = await lineItemIdGenerator(S.platform.id);
            const total = (Number(serviceType.default_rate || 0) * catalogItem.quantity).toFixed(2);

            const [lineItem] = await db
                .insert(schema.lineItems)
                .values({
                    platform_id: pid,
                    order_id: null,
                    inbound_request_id: null,
                    service_request_id: serviceRequest.id,
                    line_item_id: lineItemId,
                    purpose_type: "SERVICE_REQUEST" as const,
                    service_type_id: serviceType.id,
                    line_item_type: "CATALOG" as const,
                    category: serviceType.category,
                    description: serviceType.name,
                    quantity: catalogItem.quantity.toString(),
                    unit: serviceType.unit,
                    unit_rate: serviceType.default_rate,
                    total,
                    added_by: catalogItem.added_by,
                    added_at: new Date(def.created_at.getTime() + 2 * 3600000),
                    notes: catalogItem.notes,
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(lineItem);
        }

        for (const customItem of def.custom_items) {
            const lineItemId = await lineItemIdGenerator(S.platform.id);
            const [lineItem] = await db
                .insert(schema.lineItems)
                .values({
                    platform_id: pid,
                    order_id: null,
                    inbound_request_id: null,
                    service_request_id: serviceRequest.id,
                    line_item_id: lineItemId,
                    purpose_type: "SERVICE_REQUEST" as const,
                    service_type_id: null,
                    line_item_type: "CUSTOM" as const,
                    category: customItem.category,
                    description: customItem.description,
                    quantity: null,
                    unit: null,
                    unit_rate: null,
                    total: customItem.total.toFixed(2),
                    added_by: customItem.added_by,
                    added_at: new Date(def.created_at.getTime() + 3 * 3600000),
                    notes: customItem.notes,
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(lineItem);
        }
    }

    console.log(`✓ ${S.serviceRequests.length} service requests`);
}

// ============================================================
// ASSET BOOKINGS
// ============================================================

async function seedAssetBookings() {
    console.log("📅 Seeding asset bookings...");
    const bookableStatuses = [
        "CONFIRMED",
        "IN_PREPARATION",
        "READY_FOR_DELIVERY",
        "IN_TRANSIT",
        "IN_USE",
        "DELIVERED",
        "AWAITING_RETURN",
        "RETURN_IN_TRANSIT",
        "AWAITING_FABRICATION",
    ];
    let count = 0;

    for (const order of S.orders) {
        if (!bookableStatuses.includes(order.order_status)) continue;
        const items = S.orderItems.filter((i: any) => i.order_id === order.id);
        for (const item of items) {
            await db.insert(schema.assetBookings).values({
                asset_id: item.asset_id,
                order_id: order.id,
                quantity: item.quantity,
                blocked_from: order.event_start_date,
                blocked_until: order.event_end_date,
            });
            count++;
        }
    }
    console.log(`✓ ${count} asset bookings`);
}

// ============================================================
// SCAN EVENTS — Only for orders past IN_PREPARATION
// ============================================================

async function seedScanEvents() {
    console.log("📱 Seeding scan events...");
    const logistics = userByEmail("logistics@test.com");
    let outCount = 0;
    let inCount = 0;

    for (const order of S.orders) {
        const items = S.orderItems.filter((i: any) => i.order_id === order.id);

        // Outbound scans: orders that have completed scanning (READY_FOR_DELIVERY and beyond, NOT IN_PREPARATION)
        if (
            [
                "READY_FOR_DELIVERY",
                "IN_TRANSIT",
                "DELIVERED",
                "IN_USE",
                "AWAITING_RETURN",
                "RETURN_IN_TRANSIT",
                "CLOSED",
            ].includes(order.order_status)
        ) {
            for (const item of items) {
                await db.insert(schema.scanEvents).values({
                    order_id: order.id,
                    asset_id: item.asset_id,
                    scan_type: "OUTBOUND" as ScanType,
                    quantity: item.quantity,
                    condition: "GREEN" as AssetCondition,
                    notes: "All items verified before loading",
                    photos: [],
                    latest_return_images: [],
                    damage_report_photos: [],
                    damage_report_entries: [],
                    discrepancy_reason: null,
                    scanned_by: logistics.id,
                    scanned_at: new Date(order.event_start_date.getTime() - 24 * 3600000),
                });
                outCount++;
            }
        }

        // Inbound scans: ONLY for CLOSED orders (not AWAITING_RETURN — that's the live demo)
        if (order.order_status === "CLOSED") {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // Vary conditions: first = GREEN, second = ORANGE, rest = GREEN
                const condition: AssetCondition = i === 1 ? "ORANGE" : "GREEN";
                const notes =
                    condition === "ORANGE"
                        ? "Minor scuff on surface, still usable"
                        : "Returned in excellent condition";
                const latestReturnImages = [
                    `https://placehold.co/1200x800/334155/FFFFFF?text=${encodeURIComponent(`${item.asset_name}\\nReturn Wide 1`)}`,
                    `https://placehold.co/1200x800/1e293b/FFFFFF?text=${encodeURIComponent(`${item.asset_name}\\nReturn Wide 2`)}`,
                ];
                const damageReportEntries =
                    condition === "ORANGE"
                        ? [
                              {
                                  url: `https://placehold.co/900x700/f97316/FFFFFF?text=${encodeURIComponent(`${item.asset_name}\\nDamage Close-up`)}`,
                                  description:
                                      "Surface scuff on visible panel; customer accepted use with disclosure.",
                              },
                          ]
                        : [];
                const damagePhotos = damageReportEntries.map((entry) => entry.url);

                await db.insert(schema.scanEvents).values({
                    order_id: order.id,
                    asset_id: item.asset_id,
                    scan_type: "INBOUND" as ScanType,
                    quantity: item.quantity,
                    condition,
                    notes,
                    photos: damagePhotos,
                    latest_return_images: latestReturnImages,
                    damage_report_photos: damagePhotos,
                    damage_report_entries: damageReportEntries,
                    discrepancy_reason: condition === "ORANGE" ? "BROKEN" : null,
                    scanned_by: logistics.id,
                    scanned_at: new Date(order.event_end_date.getTime() + 36 * 3600000),
                });
                inCount++;
            }
        }
    }
    console.log(`✓ ${outCount} outbound + ${inCount} inbound scan events`);
    console.log(`  ⚠️  IN_PREPARATION order has 0 outbound scans (ready for live demo)`);
    console.log(`  ⚠️  AWAITING_RETURN order has 0 inbound scans (ready for live demo)`);
}

// ============================================================
// STATUS HISTORY
// ============================================================

function getStatusProgression(finalStatus: string): string[] {
    const p: Record<string, string[]> = {
        DRAFT: ["DRAFT"],
        SUBMITTED: ["DRAFT", "SUBMITTED"],
        PRICING_REVIEW: ["DRAFT", "PRICING_REVIEW"],
        PENDING_APPROVAL: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL"],
        QUOTED: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED"],
        CONFIRMED: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED"],
        AWAITING_FABRICATION: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "AWAITING_FABRICATION",
        ],
        IN_PREPARATION: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
        ],
        READY_FOR_DELIVERY: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
        ],
        IN_TRANSIT: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
        ],
        DELIVERED: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
        ],
        IN_USE: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
            "IN_USE",
        ],
        AWAITING_RETURN: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
            "AWAITING_RETURN",
        ],
        RETURN_IN_TRANSIT: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
            "AWAITING_RETURN",
            "RETURN_IN_TRANSIT",
        ],
        CLOSED: [
            "DRAFT",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
            "CONFIRMED",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
            "AWAITING_RETURN",
            "CLOSED",
        ],
        CANCELLED: ["DRAFT", "CANCELLED"],
    };
    return p[finalStatus] || ["DRAFT"];
}

function getFinancialProgression(finalStatus: string): string[] {
    const p: Record<string, string[]> = {
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
        CANCELLED: ["PENDING_QUOTE", "CANCELLED"],
    };
    return p[finalStatus] || ["PENDING_QUOTE"];
}

const statusNotes: Record<string, string> = {
    DRAFT: "Order created",
    SUBMITTED: "Order submitted by client",
    PRICING_REVIEW: "Under logistics review",
    PENDING_APPROVAL: "Awaiting admin approval",
    QUOTED: "Quote sent to client",
    CONFIRMED: "Client approved quote",
    AWAITING_FABRICATION: "Awaiting fabrication completion",
    IN_PREPARATION: "Items being prepared",
    READY_FOR_DELIVERY: "Ready for pickup",
    IN_TRANSIT: "En route to venue",
    DELIVERED: "Delivered to venue",
    IN_USE: "Event currently in progress",
    AWAITING_RETURN: "Event complete, awaiting pickup",
    RETURN_IN_TRANSIT: "Items picked up and returning to warehouse",
    CLOSED: "Order complete",
    CANCELLED: "Order cancelled",
};

const financialNotes: Record<string, string> = {
    PENDING_QUOTE: "Awaiting pricing",
    QUOTE_SENT: "Quote delivered to client",
    QUOTE_REVISED: "Quote revised after client/logistics feedback",
    QUOTE_ACCEPTED: "Client accepted quote",
    PENDING_INVOICE: "Preparing invoice",
    INVOICED: "Invoice generated and sent",
    PAID: "Payment received",
    CANCELLED: "Order cancelled",
};

async function seedOrderHistory() {
    console.log("📜 Seeding order & financial history...");
    const admin = userByEmail("admin@test.com");
    const logistics = userByEmail("logistics@test.com");
    let statusCount = 0;
    let financialCount = 0;

    for (const order of S.orders) {
        // Order status history
        const statuses = getStatusProgression(order.order_status);
        const statusStepMs = 2 * 24 * 3600000;
        const statusLatestTs = new Date(order.updated_at || order.created_at);
        const statusStartTs = new Date(
            statusLatestTs.getTime() - (statuses.length - 1) * statusStepMs
        );
        for (let i = 0; i < statuses.length; i++) {
            const s = statuses[i];
            const updatedBy = [
                "PRICING_REVIEW",
                "IN_PREPARATION",
                "READY_FOR_DELIVERY",
                "IN_TRANSIT",
                "DELIVERED",
                "AWAITING_RETURN",
                "RETURN_IN_TRANSIT",
                "CLOSED",
            ].includes(s)
                ? logistics
                : admin;
            await db.insert(schema.orderStatusHistory).values({
                platform_id: S.platform.id,
                order_id: order.id,
                status: s as OrderStatus,
                notes: statusNotes[s] || "Status updated",
                updated_by: updatedBy.id,
                timestamp: new Date(statusStartTs.getTime() + i * statusStepMs),
            });
            statusCount++;
        }

        // Financial status history
        const financials = getFinancialProgression(order.financial_status);
        const financialStepMs = 2 * 24 * 3600000;
        const financialLatestTs = new Date(order.updated_at || order.created_at);
        const financialStartTs = new Date(
            financialLatestTs.getTime() - (financials.length - 1) * financialStepMs
        );
        for (let i = 0; i < financials.length; i++) {
            const f = financials[i];
            await db.insert(schema.financialStatusHistory).values({
                platform_id: S.platform.id,
                order_id: order.id,
                status: f as FinancialStatus,
                notes: financialNotes[f] || "Financial status updated",
                updated_by: admin.id,
                timestamp: new Date(financialStartTs.getTime() + i * financialStepMs),
            });
            financialCount++;
        }
    }
    console.log(`✓ ${statusCount} status history + ${financialCount} financial history entries`);
}

// ============================================================
// INVOICES
// ============================================================

async function seedInvoices() {
    console.log("🧾 Seeding invoices...");
    const admin = userByEmail("admin@test.com");
    let count = 0;

    for (const order of S.orders) {
        if (
            !["INVOICED", "PAID"].includes(order.financial_status) &&
            order.order_status !== "CLOSED"
        )
            continue;

        const invoiceId = `INV-${order.order_id.replace("ORD-", "")}`;
        const pdfUrl = `https://kadence-storage.s3.us-east-1.amazonaws.com/${S.platform.id}/invoices/${order.id}/${invoiceId}.pdf`;

        await db.insert(schema.invoices).values({
            platform_id: S.platform.id,
            order_id: order.id,
            inbound_request_id: null,
            type: "ORDER" as const,
            invoice_id: invoiceId,
            invoice_pdf_url: pdfUrl,
            invoice_paid_at: order.financial_status === "PAID" ? daysFromNow(-5) : null,
            payment_method: order.financial_status === "PAID" ? "Bank Transfer" : null,
            payment_reference:
                order.financial_status === "PAID"
                    ? `PAY-2026-${String(count + 1).padStart(4, "0")}`
                    : null,
            generated_by: admin.id,
            updated_by: null,
        });
        count++;
    }

    for (const serviceRequest of S.serviceRequests) {
        if (
            serviceRequest.billing_mode !== "CLIENT_BILLABLE" ||
            !["INVOICED", "PAID"].includes(serviceRequest.commercial_status)
        ) {
            continue;
        }

        const invoiceId = `INV-${serviceRequest.service_request_id.replace("SR-", "SR")}`;
        const pdfUrl = `https://kadence-storage.s3.us-east-1.amazonaws.com/${S.platform.id}/invoices/${serviceRequest.id}/${invoiceId}.pdf`;

        await db.insert(schema.invoices).values({
            platform_id: S.platform.id,
            order_id: null,
            inbound_request_id: null,
            service_request_id: serviceRequest.id,
            type: "SERVICE_REQUEST" as const,
            invoice_id: invoiceId,
            invoice_pdf_url: pdfUrl,
            invoice_paid_at: serviceRequest.commercial_status === "PAID" ? daysFromNow(-1) : null,
            payment_method: serviceRequest.commercial_status === "PAID" ? "Bank Transfer" : null,
            payment_reference:
                serviceRequest.commercial_status === "PAID"
                    ? `PAY-SR-2026-${String(count + 1).padStart(4, "0")}`
                    : null,
            generated_by: admin.id,
            updated_by: null,
        });
        count++;
    }
    console.log(`✓ ${count} invoices`);
}

// ============================================================
// CONDITION HISTORY
// ============================================================

async function seedConditionHistory() {
    console.log("🔧 Seeding asset condition history...");
    const logistics = userByEmail("logistics@test.com");
    let count = 0;
    let fixedHistorySeeded = 0;

    for (const asset of S.assets) {
        if (asset.condition !== "GREEN") {
            const damagePhoto = `https://placehold.co/800x600/dc2626/FFFFFF?text=${encodeURIComponent(`${asset.name}\\nDamage`)}`;
            await db.insert(schema.assetConditionHistory).values({
                platform_id: S.platform.id,
                asset_id: asset.id,
                condition: asset.condition,
                notes: asset.condition_notes || "Condition noted during inspection",
                photos: [damagePhoto],
                damage_report_entries: [
                    {
                        url: damagePhoto,
                        description:
                            asset.condition === "RED"
                                ? "Critical damage logged for mandatory refurbishment."
                                : "Visible wear logged for optional maintenance decision.",
                    },
                ],
                updated_by: logistics.id,
                timestamp: daysFromNow(-3),
            });
            count++;
            continue;
        }

        // Seed a "damage then fixed" history path on a subset of GREEN assets for demo visibility.
        if (fixedHistorySeeded >= 8) continue;

        const beforeFixPhoto = `https://placehold.co/800x600/dc2626/FFFFFF?text=${encodeURIComponent(`${asset.name}\\nBefore Fix`)}`;
        await db.insert(schema.assetConditionHistory).values({
            platform_id: S.platform.id,
            asset_id: asset.id,
            condition: "RED",
            notes: "Inbound inspection found damage requiring refurbishment",
            photos: [beforeFixPhoto],
            damage_report_entries: [
                {
                    url: beforeFixPhoto,
                    description: "Structural issue found during inbound inspection.",
                },
            ],
            updated_by: logistics.id,
            timestamp: daysFromNow(-7),
        });
        count++;

        await db.insert(schema.assetConditionHistory).values({
            platform_id: S.platform.id,
            asset_id: asset.id,
            condition: "GREEN",
            notes: "Maintenance completed and item restored to service condition",
            photos: [
                `https://placehold.co/800x600/16a34a/FFFFFF?text=${encodeURIComponent(`${asset.name}\\nAfter Fix`)}`,
            ],
            damage_report_entries: [],
            updated_by: logistics.id,
            timestamp: daysFromNow(-2),
        });
        count++;
        fixedHistorySeeded++;
    }
    console.log(`✓ ${count} condition history entries`);
}

// ============================================================
// ASSET VERSIONS
// ============================================================

async function seedAssetVersions() {
    console.log("📋 Seeding asset versions...");
    const admin = userByEmail("admin@test.com");
    let count = 0;

    for (const asset of S.assets) {
        const snapshot = {
            name: asset.name,
            brand_id: asset.brand_id,
            brand_name: S.brands.find((b: any) => b.id === asset.brand_id)?.name || null,
            category: asset.category,
            images: asset.images,
            on_display_image: asset.on_display_image,
            condition: asset.condition,
            condition_notes: asset.condition_notes,
            refurb_days_estimate: asset.refurb_days_estimate,
            weight_per_unit: asset.weight_per_unit,
            dimensions: asset.dimensions,
            volume_per_unit: asset.volume_per_unit,
            warehouse_id: asset.warehouse_id,
            warehouse_name: S.warehouses[0]?.name || null,
            zone_id: asset.zone_id,
            zone_name: S.zones.find((z: any) => z.id === asset.zone_id)?.name || null,
            total_quantity: asset.total_quantity,
            available_quantity: asset.available_quantity,
            handling_tags: asset.handling_tags,
            status: asset.status,
        };

        await db.insert(schema.assetVersions).values({
            platform_id: S.platform.id,
            asset_id: asset.id,
            version_number: 1,
            reason: "Created",
            order_id: null,
            snapshot,
            created_by: admin.id,
        });
        count++;
    }
    console.log(`✓ ${count} initial asset versions`);
}

// ============================================================
// NOTIFICATION RULES (DEFAULT PLATFORM RULES)
// ============================================================

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
        // order.submitted
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

        // quote.sent
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

        // quote.revised
        {
            event_type: "quote.revised",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "quote_revised_client",
            sort_order: 0,
        },
        {
            event_type: "quote.revised",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "quote_revised_admin",
            sort_order: 1,
        },

        // quote.approved
        {
            event_type: "quote.approved",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "quote_approved_admin",
            sort_order: 0,
        },
        {
            event_type: "quote.approved",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "quote_approved_logistics",
            sort_order: 1,
        },

        // quote.declined
        {
            event_type: "quote.declined",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "quote_declined_admin",
            sort_order: 0,
        },
        {
            event_type: "quote.declined",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "quote_declined_logistics",
            sort_order: 1,
        },

        // invoice.generated
        {
            event_type: "invoice.generated",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "invoice_generated_client",
            sort_order: 0,
        },
        {
            event_type: "invoice.generated",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "invoice_generated_admin",
            sort_order: 1,
        },

        // payment.confirmed
        {
            event_type: "payment.confirmed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "payment_confirmed_admin",
            sort_order: 0,
        },
        {
            event_type: "payment.confirmed",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "payment_confirmed_logistics",
            sort_order: 1,
        },

        // order.confirmed
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
            recipient_value: "ADMIN",
            template_key: "order_confirmed_admin",
            sort_order: 1,
        },
        {
            event_type: "order.confirmed",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_confirmed_logistics",
            sort_order: 2,
        },

        // order.cancelled
        {
            event_type: "order.cancelled",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_cancelled_client",
            sort_order: 0,
        },
        {
            event_type: "order.cancelled",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_cancelled_admin",
            sort_order: 1,
        },
        {
            event_type: "order.cancelled",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_cancelled_logistics",
            sort_order: 2,
        },

        // order.ready_for_delivery
        {
            event_type: "order.ready_for_delivery",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_ready_admin",
            sort_order: 0,
        },

        // order.in_transit
        {
            event_type: "order.in_transit",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_in_transit_client",
            sort_order: 0,
        },
        {
            event_type: "order.in_transit",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_in_transit_admin",
            sort_order: 1,
        },

        // order.delivered
        {
            event_type: "order.delivered",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_delivered_client",
            sort_order: 0,
        },
        {
            event_type: "order.delivered",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_delivered_admin",
            sort_order: 1,
        },
        {
            event_type: "order.delivered",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_delivered_logistics",
            sort_order: 2,
        },

        // order.pickup_reminder
        {
            event_type: "order.pickup_reminder",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "pickup_reminder_client",
            sort_order: 0,
        },
        {
            event_type: "order.pickup_reminder",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "pickup_reminder_admin",
            sort_order: 1,
        },
        {
            event_type: "order.pickup_reminder",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "pickup_reminder_logistics",
            sort_order: 2,
        },

        // order.closed
        {
            event_type: "order.closed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_closed_admin",
            sort_order: 0,
        },

        // order.time_windows_updated
        {
            event_type: "order.time_windows_updated",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "time_windows_updated_client",
            sort_order: 0,
        },
        {
            event_type: "order.time_windows_updated",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "time_windows_updated_admin",
            sort_order: 1,
        },

        // fabrication.completed
        {
            event_type: "fabrication.completed",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "fabrication_completed_logistics",
            sort_order: 0,
        },
        {
            event_type: "fabrication.completed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "fabrication_completed_admin",
            sort_order: 1,
        },

        // inbound_request.submitted
        {
            event_type: "inbound_request.submitted",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "ir_submitted_client",
            sort_order: 0,
        },
        {
            event_type: "inbound_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "ir_submitted_admin",
            sort_order: 1,
        },
        {
            event_type: "inbound_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "ir_submitted_logistics",
            sort_order: 2,
        },

        // inbound_request.quoted
        {
            event_type: "inbound_request.quoted",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "ir_quoted_client",
            sort_order: 0,
        },

        // inbound_request.approved
        {
            event_type: "inbound_request.approved",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "ir_approved_admin",
            sort_order: 0,
        },
        {
            event_type: "inbound_request.approved",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "ir_approved_logistics",
            sort_order: 1,
        },

        // inbound_request.completed
        {
            event_type: "inbound_request.completed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "ir_completed_client",
            sort_order: 0,
        },

        // inbound_request.invoice_generated
        {
            event_type: "inbound_request.invoice_generated",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "ir_invoice_client",
            sort_order: 0,
        },
        {
            event_type: "inbound_request.invoice_generated",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "ir_invoice_admin",
            sort_order: 1,
        },

        // service_request.submitted
        {
            event_type: "service_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "sr_submitted_admin",
            sort_order: 0,
        },
        {
            event_type: "service_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "sr_submitted_logistics",
            sort_order: 1,
        },

        // service_request.quoted
        {
            event_type: "service_request.quoted",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "sr_quoted_client",
            sort_order: 0,
        },

        // service_request.quote_revised
        {
            event_type: "service_request.quote_revised",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "sr_quote_revised_client",
            sort_order: 0,
        },

        // service_request.approved
        {
            event_type: "service_request.approved",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "sr_approved_admin",
            sort_order: 0,
        },

        // service_request.completed
        {
            event_type: "service_request.completed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "sr_completed_client",
            sort_order: 0,
        },
        {
            event_type: "service_request.completed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "sr_completed_admin",
            sort_order: 1,
        },

        // service_request.invoice_generated
        {
            event_type: "service_request.invoice_generated",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "sr_invoice_client",
            sort_order: 0,
        },
        {
            event_type: "service_request.invoice_generated",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "sr_invoice_admin",
            sort_order: 1,
        },

        // auth.password_reset_requested
        {
            event_type: "auth.password_reset_requested",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "password_reset_otp",
            sort_order: 0,
        },
    ];

    for (const rule of rules) {
        await db.insert(schema.notificationRules).values({
            platform_id: pid,
            event_type: rule.event_type,
            company_id: null,
            recipient_type: rule.recipient_type,
            recipient_value: rule.recipient_value,
            template_key: rule.template_key,
            is_enabled: true,
            sort_order: rule.sort_order,
        });
    }

    console.log(`✓ ${rules.length} default notification rules`);
}

// ============================================================
// INBOUND REQUESTS (NEW)
// ============================================================

async function seedInboundRequests() {
    console.log("📥 Seeding inbound requests...");
    const pid = S.platform.id;
    const pr = companyByName("Pernod Ricard");
    const dg = companyByName("Diageo");
    const prClient = userByEmail("client@pernod-ricard.com");
    const dgClient = userByEmail("client@diageo.com");
    const admin = userByEmail("admin@test.com");

    const irDefs = [
        {
            id: "IR-20260212-001",
            company: pr,
            requester: prClient,
            status: "PRICING_REVIEW" as const,
            financial: "PENDING_QUOTE" as const,
            incomingAt: daysFromNow(5),
            note: "New batch of Absolut branded glassware arriving from supplier",
            items: [
                {
                    name: "Absolut Branded Martini Glass",
                    category: "Glassware",
                    tracking: "BATCH" as TrackingMethod,
                    qty: 40,
                    weight: 0.28,
                    volume: 0.003,
                    dims: { length: 12, width: 12, height: 18 },
                    brand: "Absolut",
                },
                {
                    name: "Absolut Ice Bucket",
                    category: "Decor",
                    tracking: "BATCH" as TrackingMethod,
                    qty: 15,
                    weight: 1.5,
                    volume: 0.01,
                    dims: { length: 25, width: 25, height: 30 },
                    brand: "Absolut",
                },
            ],
            label: "New — needs pricing review",
        },
        {
            id: "IR-20260210-002",
            company: pr,
            requester: prClient,
            status: "CONFIRMED" as const,
            financial: "QUOTE_ACCEPTED" as const,
            incomingAt: daysFromNow(3),
            note: "Chivas Regal lounge furniture from fabricator",
            items: [
                {
                    name: "Chivas Regal Branded Sofa",
                    category: "Furniture",
                    tracking: "INDIVIDUAL" as TrackingMethod,
                    qty: 1,
                    weight: 60,
                    volume: 1.5,
                    dims: { length: 200, width: 85, height: 80 },
                    brand: "Chivas Regal",
                },
                {
                    name: "Chivas Regal Coffee Table",
                    category: "Furniture",
                    tracking: "INDIVIDUAL" as TrackingMethod,
                    qty: 1,
                    weight: 25,
                    volume: 0.6,
                    dims: { length: 120, width: 60, height: 45 },
                    brand: "Chivas Regal",
                },
            ],
            label: "Approved — awaiting receipt",
        },
        {
            id: "IR-20260205-003",
            company: dg,
            requester: dgClient,
            status: "COMPLETED" as const,
            financial: "INVOICED" as const,
            incomingAt: daysFromNow(-5),
            note: "Johnnie Walker branded bar stools from supplier",
            items: [
                {
                    name: "JW Black Label Bar Stool",
                    category: "Furniture",
                    tracking: "INDIVIDUAL" as TrackingMethod,
                    qty: 1,
                    weight: 9,
                    volume: 0.25,
                    dims: { length: 45, width: 45, height: 105 },
                    brand: "Johnnie Walker",
                },
            ],
            label: "Completed — assets created",
        },
    ];

    for (const def of irDefs) {
        const warehouseOpsRate = parseFloat(def.company.warehouse_ops_rate);
        const totalVolume = def.items.reduce((sum, i) => sum + i.qty * i.volume, 0);
        const baseOps = warehouseOpsRate * totalVolume;
        const marginPercent = parseFloat(def.company.platform_margin_percent);
        const logSub = baseOps;
        const marginAmt = logSub * (marginPercent / 100);
        const finalTotal = logSub + marginAmt;

        const [price] = await db
            .insert(schema.prices)
            .values({
                platform_id: pid,
                warehouse_ops_rate: warehouseOpsRate.toFixed(2),
                base_ops_total: baseOps.toFixed(2),
                logistics_sub_total: logSub.toFixed(2),
                transport: { system_rate: 0, final_rate: 0 },
                line_items: { catalog_total: 0, custom_total: 0 },
                margin: {
                    percent: marginPercent,
                    amount: marginAmt,
                    is_override: false,
                    override_reason: null,
                },
                final_total: finalTotal.toFixed(2),
                calculated_at: new Date(),
                calculated_by: def.requester.id,
            })
            .returning();

        const [ir] = await db
            .insert(schema.inboundRequests)
            .values({
                platform_id: pid,
                inbound_request_id: def.id,
                company_id: def.company.id,
                created_by: def.requester.id,
                incoming_at: def.incomingAt,
                note: def.note,
                request_status: def.status,
                financial_status: def.financial,
                request_pricing_id: price.id,
            })
            .returning();

        // Insert items
        for (const item of def.items) {
            const brand = S.brands.find(
                (b: any) => b.name === item.brand && b.company_id === def.company.id
            );
            await db.insert(schema.inboundRequestItems).values({
                inbound_request_id: ir.id,
                brand_id: brand?.id || null,
                name: item.name,
                description: `${item.name} for warehouse storage`,
                category: item.category,
                tracking_method: item.tracking,
                quantity: item.qty,
                packaging: item.tracking === "BATCH" ? "Cardboard box" : null,
                weight_per_unit: item.weight.toString(),
                dimensions: item.dims,
                volume_per_unit: item.volume.toString(),
                handling_tags: item.category === "Glassware" ? ["Fragile"] : [],
                images: [],
                asset_id: null,
            });
        }

        // For COMPLETED request, generate invoice
        if (def.status === "COMPLETED") {
            const invoiceId = `INV-${def.id.replace("IR-", "IR")}`;
            await db.insert(schema.invoices).values({
                platform_id: pid,
                order_id: null,
                inbound_request_id: ir.id,
                type: "INBOUND_REQUEST" as const,
                invoice_id: invoiceId,
                invoice_pdf_url: `https://kadence-storage.s3.us-east-1.amazonaws.com/${pid}/invoices/${ir.id}/${invoiceId}.pdf`,
                generated_by: admin.id,
                updated_by: null,
            });
        }

        S.inboundRequests.push({ ...ir, _label: def.label });
    }

    console.log(`✓ ${S.inboundRequests.length} inbound requests`);
    S.inboundRequests.forEach((ir: any) =>
        console.log(`  ${ir.inbound_request_id} [${ir.request_status}] — ${ir._label}`)
    );
}

// ============================================================
// CLEANUP
// ============================================================

async function cleanup() {
    console.log("🧹 Cleaning up existing data...");
    try {
        try {
            await db.execute(
                sql`UPDATE transport_rates SET trip_type = 'ONE_WAY' WHERE trip_type = 'ADDITIONAL'`
            );
        } catch (_) {
            /* ignore */
        }

        const safeDelete = async (label: string, fn: () => Promise<unknown>) => {
            try {
                await fn();
            } catch (error) {
                console.log(`  ↳ Skipping ${label}: ${(error as Error).message}`);
            }
        };

        // Delete in reverse dependency order
        await safeDelete("notification_logs", () => db.delete(schema.notificationLogs));
        await safeDelete("system_events", () => db.delete(schema.systemEvents));
        await safeDelete("notification_rules", () => db.delete(schema.notificationRules));
        await safeDelete("asset_versions", () => db.delete(schema.assetVersions));
        await safeDelete("asset_condition_history", () => db.delete(schema.assetConditionHistory));
        await safeDelete("scan_events", () => db.delete(schema.scanEvents));
        await safeDelete("financial_status_history", () =>
            db.delete(schema.financialStatusHistory)
        );
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
    } catch (error) {
        console.log("⚠️  Cleanup warning:", (error as Error).message);
    }
}

// ============================================================
// MAIN
// ============================================================

console.log("\n========================================");
console.log("DEMO-READY DATABASE SEED");
console.log("========================================\n");

async function main() {
    try {
        console.log("🚀 Starting demo seed...\n");

        // Phase 0
        await cleanup();

        // Phase 1: Infrastructure
        await seedPlatform();
        await seedCompanies();
        await seedCountriesAndCities();
        await seedCompanyDomains();
        await seedWarehouses();
        await seedUsers();
        await seedBrands();
        await seedZones();
        await seedVehicleTypes();

        // Phase 2: Pricing config
        await seedTransportRates();
        await seedServiceTypes();

        // Phase 3: Assets & collections
        await seedAssets();
        await seedCollections();

        // Phase 4: Orders & workflow
        await seedOrders();
        await seedOrderItems();
        await seedLineItems();
        await seedServiceRequests();
        await seedAssetBookings();

        // Phase 5: Scanning & conditions
        await seedScanEvents();
        await seedConditionHistory();
        await seedAssetVersions();

        // Phase 6: History, invoices, notifications
        await seedOrderHistory();
        await seedInvoices();
        await seedNotificationRules();

        // Phase 7: Inbound requests (NEW)
        await seedInboundRequests();

        // Summary
        console.log("\n✅ DEMO SEED COMPLETE!\n");
        console.log("📊 Summary:");
        console.log(`  Platform: ${S.platform.name} (${S.platform.domain})`);
        console.log(`  Companies: ${S.companies.length}`);
        console.log(`  Users: ${S.users.length}`);
        console.log(`  Brands: ${S.brands.length}`);
        console.log(`  Assets: ${S.assets.length} (deterministic QR codes)`);
        console.log(`  Orders: ${S.orders.length}`);
        console.log(`  Service Requests: ${S.serviceRequests.length}`);
        console.log(`  Inbound Requests: ${S.inboundRequests.length}`);

        console.log("\n📋 QR Codes for Scanning Demo:");
        const scanOrder003 = S.orders.find((o: any) => o.order_id === "ORD-20260208-003");
        const scanOrder004 = S.orders.find((o: any) => o.order_id === "ORD-20260201-004");
        if (scanOrder003) {
            console.log(`  Outbound scanning (${scanOrder003.order_id}):`);
            S.orderItems
                .filter((i: any) => i.order_id === scanOrder003.id)
                .forEach((i: any) => {
                    const a = S.assets.find((a: any) => a.id === i.asset_id);
                    console.log(`    ${a?.qr_code} — ${i.asset_name} (qty: ${i.quantity})`);
                });
        }
        if (scanOrder004) {
            console.log(`  Inbound scanning (${scanOrder004.order_id}):`);
            S.orderItems
                .filter((i: any) => i.order_id === scanOrder004.id)
                .forEach((i: any) => {
                    const a = S.assets.find((a: any) => a.id === i.asset_id);
                    console.log(`    ${a?.qr_code} — ${i.asset_name} (qty: ${i.quantity})`);
                });
        }

        console.log("\n🔑 Credentials (all password123):");
        console.log("  Admin:     admin@test.com");
        console.log("  Logistics: logistics@test.com");
        console.log("  PR Client: client@pernod-ricard.com");
        console.log("  DG Client: client@diageo.com\n");
    } catch (error) {
        console.error("\n❌ Seed failed:", error);
        throw error;
    }
}

main();
