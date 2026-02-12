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
import { eq, sql } from "drizzle-orm";

// ============================================================
// TYPE ALIASES
// ============================================================
type TrackingMethod = "INDIVIDUAL" | "BATCH";
type AssetCondition = "GREEN" | "ORANGE" | "RED";
type ScanType = "OUTBOUND" | "INBOUND";
type OrderStatus =
    | "DRAFT"
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
    | "AWAITING_RETURN"
    | "CLOSED"
    | "CANCELLED";
type FinancialStatus =
    | "PENDING_QUOTE"
    | "QUOTE_SENT"
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
    reskinRequests: [] as any[],
    lineItems: [] as any[],
    inboundRequests: [] as any[],
};

// Helper to find records
const companyByName = (name: string) => S.companies.find((c) => c.name === name)!;
const userByEmail = (email: string) => S.users.find((u) => u.email === email)!;
const brandByName = (name: string) => S.brands.find((b) => b.name === name)!;
const assetByQR = (qr: string) => S.assets.find((a) => a.qr_code === qr)!;
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

    const cityNames = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];
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
        "auth:*", "users:*", "companies:*", "brands:*", "warehouses:*", "zones:*",
        "pricing_tiers:*", "orders:*", "pricing:*", "invoices:*", "lifecycle:*",
        "notifications:*", "analytics:*", "system:*", "assets:*", "collections:*",
        "conditions:*", "inventory:*", "quotes:*", "scanning:*",
    ];
    const logisticsPerms = [
        "auth:*", "users:read", "companies:read", "brands:read", "warehouses:read",
        "zones:read", "assets:*", "collections:*", "orders:read", "orders:update",
        "orders:add_time_windows", "pricing:review", "pricing:approve_standard",
        "pricing:adjust", "lifecycle:progress_status", "lifecycle:receive_notifications",
        "scanning:*", "inventory:*", "conditions:*",
    ];
    const clientPerms = [
        "auth:*", "companies:read", "brands:read", "assets:read", "collections:read",
        "orders:create", "orders:read", "orders:update", "quotes:approve", "quotes:decline",
        "invoices:read", "invoices:download", "lifecycle:receive_notifications",
    ];

    const users = await db
        .insert(schema.users)
        .values([
            { platform_id: pid, company_id: null, name: "Admin User", email: "admin@test.com", password: pw, role: "ADMIN" as const, permissions: allPerms, permission_template: "PLATFORM_ADMIN" as const, is_active: true },
            { platform_id: pid, company_id: null, name: "Sarah Johnson", email: "sarah.admin@platform.com", password: pw, role: "ADMIN" as const, permissions: allPerms, permission_template: "PLATFORM_ADMIN" as const, is_active: true },
            { platform_id: pid, company_id: null, name: "Logistics User", email: "logistics@test.com", password: pw, role: "LOGISTICS" as const, permissions: logisticsPerms, permission_template: "LOGISTICS_STAFF" as const, is_active: true },
            { platform_id: pid, company_id: null, name: "Ahmed Al-Rashid", email: "ahmed.logistics@a2logistics.com", password: pw, role: "LOGISTICS" as const, permissions: logisticsPerms, permission_template: "LOGISTICS_STAFF" as const, is_active: true },
            { platform_id: pid, company_id: pr.id, name: "Pernod Ricard Event Manager", email: "client@pernod-ricard.com", password: pw, role: "CLIENT" as const, permissions: clientPerms, permission_template: "CLIENT_USER" as const, is_active: true },
            { platform_id: pid, company_id: dg.id, name: "Diageo Event Manager", email: "client@diageo.com", password: pw, role: "CLIENT" as const, permissions: clientPerms, permission_template: "CLIENT_USER" as const, is_active: true },
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
            { platform_id: pid, company_id: pr.id, name: "Absolut", description: "Absolut Vodka activations", logo_url: brandLogo("Absolut"), is_active: true },
            { platform_id: pid, company_id: pr.id, name: "Chivas Regal", description: "Chivas Regal events", logo_url: brandLogo("Chivas Regal"), is_active: true },
            { platform_id: pid, company_id: pr.id, name: "Jameson", description: "Jameson brand experiences", logo_url: brandLogo("Jameson"), is_active: true },
            { platform_id: pid, company_id: dg.id, name: "Johnnie Walker", description: "Johnnie Walker activations", logo_url: brandLogo("Johnnie Walker"), is_active: true },
            { platform_id: pid, company_id: dg.id, name: "Guinness", description: "Guinness experiences", logo_url: brandLogo("Guinness"), is_active: true },
            { platform_id: pid, company_id: dg.id, name: "Baileys", description: "Baileys brand events", logo_url: brandLogo("Baileys"), is_active: true },
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
                { platform_id: pid, warehouse_id: wh.id, company_id: c.id, name: `${c.name.substring(0, 3).toUpperCase()}-A`, description: `${c.name} primary zone`, capacity: 500, is_active: true },
                { platform_id: pid, warehouse_id: wh.id, company_id: c.id, name: `${c.name.substring(0, 3).toUpperCase()}-B`, description: `${c.name} overflow zone`, capacity: 300, is_active: true },
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
            { name: "Standard Truck", vehicle_size: "15", platform_id: pid, description: "Standard delivery truck", is_default: true, display_order: 1 },
            { name: "7 Ton Truck", vehicle_size: "40", platform_id: pid, description: "Large truck up to 7 tons", is_default: false, display_order: 2 },
            { name: "10 Ton Truck", vehicle_size: "60", platform_id: pid, description: "Extra large truck up to 10 tons", is_default: false, display_order: 3 },
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
                const base = vt.name === "Standard Truck" ? 500 : vt.name === "7 Ton Truck" ? 800 : 1200;
                const mult = trip === "ROUND_TRIP" ? 1.8 : 1;
                rates.push({
                    platform_id: pid, company_id: null, city_id: city.id, area: null,
                    trip_type: trip, vehicle_type_id: vt.id, rate: (base * mult).toString(), is_active: true,
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
        { name: "Basic Assembly", category: "ASSEMBLY" as const, unit: "hour", default_rate: "75.00", description: "Standard furniture assembly" },
        { name: "Complex Setup", category: "ASSEMBLY" as const, unit: "hour", default_rate: "120.00", description: "Complex installations and setups" },
        { name: "Rigging Services", category: "ASSEMBLY" as const, unit: "hour", default_rate: "150.00", description: "Professional rigging and suspension" },
        { name: "Forklift Operation", category: "EQUIPMENT" as const, unit: "hour", default_rate: "200.00", description: "Forklift and heavy equipment operation" },
        { name: "Loading/Unloading", category: "HANDLING" as const, unit: "hour", default_rate: "60.00", description: "Manual loading and unloading" },
        { name: "Fragile Item Handling", category: "HANDLING" as const, unit: "unit", default_rate: "25.00", description: "Special handling for fragile items" },
        { name: "White Glove Service", category: "HANDLING" as const, unit: "trip", default_rate: "500.00", description: "Premium handling and setup service" },
        { name: "Vinyl Wrap Application", category: "RESKIN" as const, unit: "unit", default_rate: "300.00", description: "Custom vinyl wrapping for furniture" },
        { name: "Graphic Installation", category: "RESKIN" as const, unit: "unit", default_rate: "150.00", description: "Installation of custom graphics" },
        { name: "Storage Fee", category: "OTHER" as const, unit: "day", default_rate: "50.00", description: "Daily storage charge" },
        { name: "Rush Service", category: "OTHER" as const, unit: "trip", default_rate: "750.00", description: "Expedited delivery/pickup" },
        { name: "Cleaning Service", category: "OTHER" as const, unit: "unit", default_rate: "35.00", description: "Deep cleaning of returned items" },
    ];
    const inserted = await db
        .insert(schema.serviceTypes)
        .values(services.map((s, i) => ({ platform_id: pid, ...s, display_order: i, is_active: true })))
        .returning();
    S.serviceTypes = inserted;
    console.log(`✓ ${inserted.length} service types`);
}

// ============================================================
// ASSETS — Deterministic QR codes
// ============================================================
async function seedAssets() {
    console.log("🎨 Seeding assets (deterministic QR codes)...");
    const pid = S.platform.id;
    const wh = S.warehouses[0];

    // Asset templates per category
    const templates: Record<string, Array<{ name: string; desc: string; weight: number; dims: { length: number; width: number; height: number }; volume: number; tracking: TrackingMethod; qty: number }>> = {
        Furniture: [
            { name: "Executive Round Table", desc: "Premium 6-seater round table", weight: 45, dims: { length: 150, width: 150, height: 75 }, volume: 1.688, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Chiavari Gold Chair", desc: "Classic gold chiavari chair", weight: 5.5, dims: { length: 40, width: 45, height: 90 }, volume: 0.162, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Velvet Lounge Sofa", desc: "3-seater luxury velvet sofa", weight: 65, dims: { length: 210, width: 90, height: 85 }, volume: 1.606, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Bar Stool High", desc: "Modern metal bar stool", weight: 8, dims: { length: 45, width: 45, height: 110 }, volume: 0.223, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Cocktail Table Round", desc: "High-top cocktail table", weight: 18, dims: { length: 80, width: 80, height: 110 }, volume: 0.704, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Banquet Rectangle Table", desc: "8-seater rectangular table", weight: 52, dims: { length: 240, width: 100, height: 75 }, volume: 1.8, tracking: "INDIVIDUAL", qty: 1 },
        ],
        Glassware: [
            { name: "Wine Glass Bordeaux", desc: "Premium crystal wine glass", weight: 0.25, dims: { length: 10, width: 10, height: 24 }, volume: 0.002, tracking: "BATCH", qty: 60 },
            { name: "Champagne Flute", desc: "Elegant champagne flute", weight: 0.22, dims: { length: 8, width: 8, height: 26 }, volume: 0.002, tracking: "BATCH", qty: 80 },
            { name: "Whisky Tumbler", desc: "Heavy base whisky glass", weight: 0.35, dims: { length: 9, width: 9, height: 10 }, volume: 0.001, tracking: "BATCH", qty: 50 },
        ],
        Installation: [
            { name: "Backdrop Frame 4x3m", desc: "Aluminum photo backdrop frame", weight: 28, dims: { length: 400, width: 10, height: 300 }, volume: 1.2, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Pipe and Drape System", desc: "3m high drape system per 3m", weight: 15, dims: { length: 300, width: 10, height: 300 }, volume: 0.9, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Red Carpet Runner 10m", desc: "VIP red carpet runner", weight: 18, dims: { length: 1000, width: 120, height: 2 }, volume: 0.24, tracking: "INDIVIDUAL", qty: 1 },
        ],
        Decor: [
            { name: "Floral Centerpiece Luxury", desc: "Premium floral arrangement", weight: 3.5, dims: { length: 40, width: 40, height: 50 }, volume: 0.08, tracking: "BATCH", qty: 30 },
            { name: "LED Uplighter RGB", desc: "Wireless RGB uplight", weight: 2.8, dims: { length: 15, width: 15, height: 30 }, volume: 0.007, tracking: "BATCH", qty: 40 },
            { name: "Neon Sign Custom", desc: "Custom LED neon sign", weight: 5, dims: { length: 120, width: 10, height: 60 }, volume: 0.072, tracking: "INDIVIDUAL", qty: 1 },
        ],
        Lighting: [
            { name: "Par LED Moving Head", desc: "Professional moving head light", weight: 12, dims: { length: 30, width: 30, height: 45 }, volume: 0.041, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Wash Light Bar", desc: "4-head LED wash bar", weight: 8.5, dims: { length: 120, width: 15, height: 20 }, volume: 0.036, tracking: "INDIVIDUAL", qty: 1 },
            { name: "Fairy Lights 20m", desc: "Warm white fairy light string", weight: 0.8, dims: { length: 2000, width: 5, height: 5 }, volume: 0.05, tracking: "BATCH", qty: 25 },
        ],
    };

    const companyAbbr: Record<string, string> = { "Pernod Ricard": "PR", "Diageo": "DG" };
    const catAbbr: Record<string, string> = { Furniture: "FURN", Glassware: "GLASS", Installation: "INST", Decor: "DECOR", Lighting: "LIGHT" };

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
                    status = "MAINTENANCE";
                }

                const handlingTags =
                    category === "Glassware" ? ["Fragile", "HighValue"]
                    : category === "Furniture" && t.weight > 50 ? ["HeavyLift"]
                    : category === "Installation" ? ["AssemblyRequired"]
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
        { name: "Executive Dinner Setup", desc: "Complete setup for executive dinners", category: "Dining" },
        { name: "Cocktail Reception Package", desc: "Full cocktail event setup", category: "Cocktail" },
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
    transportRate: number;
    catalogTotal?: number;
    customTotal?: number;
    userId: string;
}) {
    const baseOps = opts.volume * opts.warehouseOpsRate;
    const catTotal = opts.catalogTotal || 0;
    const custTotal = opts.customTotal || 0;
    const logSub = baseOps + opts.transportRate + catTotal;
    const marginAmt = logSub * (opts.marginPercent / 100);
    const finalTotal = logSub + marginAmt + custTotal;

    const [price] = await db
        .insert(schema.prices)
        .values({
            platform_id: S.platform.id,
            warehouse_ops_rate: opts.warehouseOpsRate.toFixed(2),
            base_ops_total: baseOps.toFixed(2),
            logistics_sub_total: logSub.toFixed(2),
            transport: { system_rate: opts.transportRate, final_rate: opts.transportRate },
            line_items: { catalog_total: catTotal, custom_total: custTotal },
            margin: { percent: opts.marginPercent, amount: marginAmt, is_override: false, override_reason: null },
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
    const admin = userByEmail("admin@test.com");
    const logistics = userByEmail("logistics@test.com");
    const dubai = cityByName("Dubai");
    const abuDhabi = cityByName("Abu Dhabi");
    const defaultVehicle = S.vehicleTypes.find((v: any) => v.is_default)!;

    // Get transport rate for Dubai round trip
    const dubaiRate = S.transportRates.find(
        (r: any) => r.city_id === dubai.id && r.vehicle_type_id === defaultVehicle.id && r.trip_type === "ROUND_TRIP"
    );
    const transportRate = dubaiRate ? parseFloat(dubaiRate.rate) : 900;
    const abuDhabiRate = S.transportRates.find(
        (r: any) => r.city_id === abuDhabi.id && r.vehicle_type_id === defaultVehicle.id && r.trip_type === "ROUND_TRIP"
    );
    const adTransportRate = abuDhabiRate ? parseFloat(abuDhabiRate.rate) : 900;

    // -------- ORDER DEFINITIONS --------
    const orderDefs = [
        // --- Pernod Ricard Orders ---
        {
            orderId: "ORD-20260212-001", company: pr, user: prClient, brand: brandByName("Absolut"),
            status: "PRICING_REVIEW" as OrderStatus, financial: "PENDING_QUOTE" as FinancialStatus,
            venue: "Dubai World Trade Centre", cityId: dubai.id, transportRate,
            eventStart: daysFromNow(14), eventEnd: daysFromNow(16),
            jobNumber: null, volume: 12.5, marginPercent: 25,
            instructions: "Setup must be complete by 6 PM the day before event. Service entrance at rear.",
            label: "Scenario 1: Pricing review",
        },
        {
            orderId: "ORD-20260210-002", company: pr, user: prClient, brand: brandByName("Chivas Regal"),
            status: "CONFIRMED" as OrderStatus, financial: "QUOTE_ACCEPTED" as FinancialStatus,
            venue: "Atlantis The Palm", cityId: dubai.id, transportRate,
            eventStart: daysFromNow(10), eventEnd: daysFromNow(12),
            jobNumber: "JOB-2026-0002", volume: 8.2, marginPercent: 25,
            instructions: "VIP event — premium handling required.",
            label: "Scenario 2a: Ready for fulfillment",
        },
        {
            orderId: "ORD-20260208-003", company: pr, user: prClient, brand: brandByName("Jameson"),
            status: "IN_PREPARATION" as OrderStatus, financial: "QUOTE_ACCEPTED" as FinancialStatus,
            venue: "Burj Al Arab", cityId: dubai.id, transportRate,
            eventStart: daysFromNow(7), eventEnd: daysFromNow(9),
            jobNumber: "JOB-2026-0003", volume: 5.6, marginPercent: 25,
            instructions: "Fragile items — double-wrap glassware.",
            label: "Scenario 2b: Live outbound scanning",
        },
        {
            orderId: "ORD-20260201-004", company: pr, user: prClient, brand: brandByName("Absolut"),
            status: "AWAITING_RETURN" as OrderStatus, financial: "PAID" as FinancialStatus,
            venue: "Emirates Palace", cityId: abuDhabi.id, transportRate: adTransportRate,
            eventStart: daysFromNow(-4), eventEnd: daysFromNow(-1),
            jobNumber: "JOB-2026-0004", volume: 10.0, marginPercent: 25,
            instructions: "Post-event cleanup included.",
            label: "Scenario 3: Live inbound scanning",
        },
        {
            orderId: "ORD-20260115-005", company: pr, user: prClient, brand: brandByName("Chivas Regal"),
            status: "CLOSED" as OrderStatus, financial: "PAID" as FinancialStatus,
            venue: "Address Downtown", cityId: dubai.id, transportRate,
            eventStart: daysFromNow(-15), eventEnd: daysFromNow(-10),
            jobNumber: "JOB-2026-0005", volume: 7.3, marginPercent: 25,
            instructions: null,
            label: "Completed lifecycle example",
        },
        // --- Diageo Orders ---
        {
            orderId: "ORD-20260211-006", company: dg, user: dgClient, brand: brandByName("Johnnie Walker"),
            status: "QUOTED" as OrderStatus, financial: "QUOTE_SENT" as FinancialStatus,
            venue: "JW Marriott Marquis", cityId: dubai.id, transportRate,
            eventStart: daysFromNow(20), eventEnd: daysFromNow(22),
            jobNumber: null, volume: 9.5, marginPercent: 22,
            instructions: "Premium whisky tasting setup. Handle with care.",
            label: "Waiting for client approval",
        },
        {
            orderId: "ORD-20260205-007", company: dg, user: dgClient, brand: brandByName("Guinness"),
            status: "DELIVERED" as OrderStatus, financial: "INVOICED" as FinancialStatus,
            venue: "Dubai World Trade Centre", cityId: dubai.id, transportRate,
            eventStart: daysFromNow(-1), eventEnd: daysFromNow(2),
            jobNumber: "JOB-2026-0007", volume: 11.0, marginPercent: 22,
            instructions: "Festival setup — outdoor area.",
            label: "Currently at venue",
        },
        {
            orderId: "ORD-20260209-008", company: dg, user: dgClient, brand: brandByName("Baileys"),
            status: "AWAITING_FABRICATION" as OrderStatus, financial: "QUOTE_ACCEPTED" as FinancialStatus,
            venue: "Atlantis The Palm", cityId: dubai.id, transportRate,
            eventStart: daysFromNow(25), eventEnd: daysFromNow(27),
            jobNumber: "JOB-2026-0008", volume: 6.0, marginPercent: 22,
            instructions: "Custom Baileys branding on all furniture pieces.",
            label: "Reskin in progress",
        },
    ];

    for (const def of orderDefs) {
        const warehouseOpsRate = parseFloat(def.company.warehouse_ops_rate);
        const catalogTotal = ["PRICING_REVIEW", "DRAFT"].includes(def.status) ? 0 : 200;
        const customTotal = def.status === "AWAITING_FABRICATION" ? 1500 : 0;

        const pricing = await createPricing({
            volume: def.volume,
            warehouseOpsRate,
            marginPercent: def.marginPercent,
            transportRate: def.transportRate,
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
                user_id: def.user.id,
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
                    access_notes: "Service entrance at rear of building. Contact security upon arrival.",
                },
                special_instructions: def.instructions,
                delivery_window: def.jobNumber ? { start: new Date(def.eventStart.getTime() - 24 * 3600000), end: new Date(def.eventStart.getTime() - 12 * 3600000) } : null,
                pickup_window: ["AWAITING_RETURN", "CLOSED"].includes(def.status) ? { start: new Date(def.eventEnd.getTime() + 12 * 3600000), end: new Date(def.eventEnd.getTime() + 36 * 3600000) } : null,
                calculated_totals: { volume: def.volume.toFixed(3), weight: (def.volume * 120).toFixed(2) },
                trip_type: "ROUND_TRIP",
                vehicle_type_id: defaultVehicle.id,
                order_pricing_id: pricing.id,
                order_status: def.status,
                financial_status: def.financial,
                scanning_data: {},
                delivery_photos: ["DELIVERED", "AWAITING_RETURN", "CLOSED"].includes(def.status)
                    ? [`https://placehold.co/800x600/475569/FFFFFF?text=${encodeURIComponent("Delivery\\nLoading")}`]
                    : [],
            })
            .returning();

        S.orders.push({ ...order, _label: def.label, _companyName: def.company.name });
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
        const furnitureAssets = companyAssets.filter((a: any) => a.category === "Furniture" && a.condition === "GREEN");
        const glasswareAssets = companyAssets.filter((a: any) => a.category === "Glassware");
        const installAssets = companyAssets.filter((a: any) => a.category === "Installation");
        const decorAssets = companyAssets.filter((a: any) => a.category === "Decor");
        const lightAssets = companyAssets.filter((a: any) => a.category === "Lighting");

        // Pick items based on order purpose
        let selectedItems: Array<{ asset: any; qty: number; isReskin?: boolean }> = [];

        if (order.order_id === "ORD-20260208-003") {
            // IN_PREPARATION — for live outbound scanning: 2 individual + 1 batch
            selectedItems = [
                { asset: furnitureAssets[0], qty: 1 },
                { asset: furnitureAssets[1], qty: 1 },
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
        } else if (order.order_id === "ORD-20260209-008") {
            // AWAITING_FABRICATION — reskin order
            selectedItems = [
                { asset: furnitureAssets[0], qty: 1, isReskin: true },
                { asset: furnitureAssets[1], qty: 1, isReskin: true },
                { asset: glasswareAssets[0], qty: 8 },
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

            // Determine reskin brand (use a different brand from the same company)
            const companyBrands = S.brands.filter((b: any) => b.company_id === order.company_id);
            const reskinBrand = item.isReskin && companyBrands.length > 1 ? companyBrands[companyBrands.length - 1] : null;

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
                    condition_notes: null,
                    handling_tags: a.handling_tags,
                    from_collection: null,
                    from_collection_name: null,
                    is_reskin_request: !!item.isReskin,
                    reskin_target_brand_id: reskinBrand?.id || null,
                    reskin_target_brand_custom: null,
                    reskin_notes: item.isReskin ? "Apply new branding as per attached mockup. Timeline critical." : null,
                })
                .returning();
            S.orderItems.push(oi);
        }
    }
    console.log(`✓ ${S.orderItems.length} order items`);
}

// ============================================================
// RESKIN REQUESTS — for AWAITING_FABRICATION order
// ============================================================

async function seedReskinRequests() {
    console.log("🎨 Seeding reskin requests...");
    const admin = userByEmail("admin@test.com");

    const reskinItems = S.orderItems.filter((i: any) => i.is_reskin_request);
    for (const item of reskinItems) {
        const order = S.orders.find((o: any) => o.id === item.order_id);
        const asset = S.assets.find((a: any) => a.id === item.asset_id);
        if (!order || !asset) continue;

        const [rr] = await db
            .insert(schema.reskinRequests)
            .values({
                platform_id: S.platform.id,
                order_id: order.id,
                order_item_id: item.id,
                original_asset_id: item.asset_id,
                original_asset_name: item.asset_name,
                original_brand_id: asset.brand_id,
                target_brand_id: item.reskin_target_brand_id,
                target_brand_custom: null,
                client_notes: "Apply new branding as per mockup. Timeline is critical for event.",
                admin_notes: "In fabrication queue. Estimated 7 days completion.",
                new_asset_id: null,
                new_asset_name: null,
                completed_at: null,
                completed_by: null,
                completion_notes: null,
                completion_photos: [],
                cancelled_at: null,
                cancelled_by: null,
                cancellation_reason: null,
            })
            .returning();
        S.reskinRequests.push(rr);
    }
    console.log(`✓ ${S.reskinRequests.length} reskin requests`);
}

// ============================================================
// LINE ITEMS
// ============================================================

async function seedLineItems() {
    console.log("💰 Seeding order line items...");
    const admin = userByEmail("admin@test.com");
    const logistics = userByEmail("logistics@test.com");

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
                    reskin_request_id: null,
                    line_item_type: "CATALOG" as const,
                    category: svc.category,
                    description: svc.name,
                    quantity: qty.toString(),
                    unit: svc.unit,
                    unit_rate: svc.default_rate,
                    total,
                    added_by: logistics.id,
                    added_at: new Date(order.created_at.getTime() + 24 * 3600000),
                    notes: null,
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(li);
        }

        // Add reskin custom line items for AWAITING_FABRICATION order
        const orderReskins = S.reskinRequests.filter((r: any) => r.order_id === order.id);
        for (const rr of orderReskins) {
            const lineItemId = await lineItemIdGenerator(S.platform.id);
            const [li] = await db
                .insert(schema.lineItems)
                .values({
                    platform_id: S.platform.id,
                    order_id: order.id,
                    inbound_request_id: null,
                    line_item_id: lineItemId,
                    purpose_type: "ORDER" as const,
                    service_type_id: null,
                    reskin_request_id: rr.id,
                    line_item_type: "CUSTOM" as const,
                    category: "RESKIN" as const,
                    description: `Rebrand: ${rr.original_asset_name}`,
                    quantity: null,
                    unit: null,
                    unit_rate: null,
                    total: "750.00",
                    added_by: admin.id,
                    added_at: new Date(order.created_at.getTime() + 36 * 3600000),
                    notes: "Custom fabrication and branding application",
                    is_voided: false,
                })
                .returning();
            S.lineItems.push(li);
        }
    }
    console.log(`✓ ${S.lineItems.length} line items`);
}

// ============================================================
// ASSET BOOKINGS
// ============================================================

async function seedAssetBookings() {
    console.log("📅 Seeding asset bookings...");
    const bookableStatuses = ["CONFIRMED", "IN_PREPARATION", "READY_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED", "AWAITING_RETURN", "AWAITING_FABRICATION"];
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
        if (["READY_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED", "AWAITING_RETURN", "CLOSED"].includes(order.order_status)) {
            for (const item of items) {
                await db.insert(schema.scanEvents).values({
                    order_id: order.id,
                    asset_id: item.asset_id,
                    scan_type: "OUTBOUND" as ScanType,
                    quantity: item.quantity,
                    condition: "GREEN" as AssetCondition,
                    notes: "All items verified before loading",
                    photos: [],
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
                const notes = condition === "ORANGE"
                    ? "Minor scuff on surface, still usable"
                    : "Returned in excellent condition";

                await db.insert(schema.scanEvents).values({
                    order_id: order.id,
                    asset_id: item.asset_id,
                    scan_type: "INBOUND" as ScanType,
                    quantity: item.quantity,
                    condition,
                    notes,
                    photos: [],
                    discrepancy_reason: null,
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
        PRICING_REVIEW: ["DRAFT", "PRICING_REVIEW"],
        PENDING_APPROVAL: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL"],
        QUOTED: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED"],
        CONFIRMED: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED"],
        AWAITING_FABRICATION: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "AWAITING_FABRICATION"],
        IN_PREPARATION: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "IN_PREPARATION"],
        READY_FOR_DELIVERY: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY_FOR_DELIVERY"],
        IN_TRANSIT: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY_FOR_DELIVERY", "IN_TRANSIT"],
        DELIVERED: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED"],
        AWAITING_RETURN: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED", "AWAITING_RETURN"],
        CLOSED: ["DRAFT", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "IN_PREPARATION", "READY_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED", "AWAITING_RETURN", "CLOSED"],
        CANCELLED: ["DRAFT", "CANCELLED"],
    };
    return p[finalStatus] || ["DRAFT"];
}

function getFinancialProgression(finalStatus: string): string[] {
    const p: Record<string, string[]> = {
        PENDING_QUOTE: ["PENDING_QUOTE"],
        QUOTE_SENT: ["PENDING_QUOTE", "QUOTE_SENT"],
        QUOTE_ACCEPTED: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED"],
        PENDING_INVOICE: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED", "PENDING_INVOICE"],
        INVOICED: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED", "PENDING_INVOICE", "INVOICED"],
        PAID: ["PENDING_QUOTE", "QUOTE_SENT", "QUOTE_ACCEPTED", "PENDING_INVOICE", "INVOICED", "PAID"],
        CANCELLED: ["PENDING_QUOTE", "CANCELLED"],
    };
    return p[finalStatus] || ["PENDING_QUOTE"];
}

const statusNotes: Record<string, string> = {
    DRAFT: "Order created",
    PRICING_REVIEW: "Under logistics review",
    PENDING_APPROVAL: "Awaiting admin approval",
    QUOTED: "Quote sent to client",
    CONFIRMED: "Client approved quote",
    AWAITING_FABRICATION: "Awaiting fabrication completion",
    IN_PREPARATION: "Items being prepared",
    READY_FOR_DELIVERY: "Ready for pickup",
    IN_TRANSIT: "En route to venue",
    DELIVERED: "Delivered to venue",
    AWAITING_RETURN: "Event complete, awaiting pickup",
    CLOSED: "Order complete",
    CANCELLED: "Order cancelled",
};

const financialNotes: Record<string, string> = {
    PENDING_QUOTE: "Awaiting pricing",
    QUOTE_SENT: "Quote delivered to client",
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
        for (let i = 0; i < statuses.length; i++) {
            const s = statuses[i];
            const updatedBy = ["PRICING_REVIEW", "IN_PREPARATION", "READY_FOR_DELIVERY"].includes(s) ? logistics : admin;
            await db.insert(schema.orderStatusHistory).values({
                platform_id: S.platform.id,
                order_id: order.id,
                status: s as OrderStatus,
                notes: statusNotes[s] || "Status updated",
                updated_by: updatedBy.id,
                timestamp: new Date(order.created_at.getTime() + i * 2 * 24 * 3600000),
            });
            statusCount++;
        }

        // Financial status history
        const financials = getFinancialProgression(order.financial_status);
        for (let i = 0; i < financials.length; i++) {
            const f = financials[i];
            await db.insert(schema.financialStatusHistory).values({
                platform_id: S.platform.id,
                order_id: order.id,
                status: f as FinancialStatus,
                notes: financialNotes[f] || "Financial status updated",
                updated_by: admin.id,
                timestamp: new Date(order.created_at.getTime() + i * 2 * 24 * 3600000),
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
        if (!["INVOICED", "PAID"].includes(order.financial_status) && order.order_status !== "CLOSED") continue;

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
            payment_reference: order.financial_status === "PAID" ? `PAY-2026-${String(count + 1).padStart(4, "0")}` : null,
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

    for (const asset of S.assets) {
        if (asset.condition === "GREEN") continue;
        await db.insert(schema.assetConditionHistory).values({
            platform_id: S.platform.id,
            asset_id: asset.id,
            condition: asset.condition,
            notes: asset.condition_notes || "Condition noted during inspection",
            photos: asset.condition === "RED"
                ? [`https://placehold.co/800x600/dc2626/FFFFFF?text=${encodeURIComponent("Damage\\nReport")}`]
                : [],
            updated_by: logistics.id,
            timestamp: daysFromNow(-3),
        });
        count++;
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
            condition: asset.condition,
            condition_notes: asset.condition_notes,
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
// NOTIFICATION LOGS
// ============================================================

async function seedNotificationLogs() {
    console.log("📧 Seeding notification logs...");
    let count = 0;

    for (const order of S.orders) {
        const user = S.users.find((u: any) => u.id === order.user_id);
        const types: string[] = [];

        if (["PENDING_APPROVAL", "QUOTED", "CONFIRMED"].includes(order.order_status)) types.push("QUOTE_SENT");
        if (order.order_status === "CONFIRMED") types.push("QUOTE_APPROVED");
        if (["READY_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED", "AWAITING_RETURN", "CLOSED"].includes(order.order_status)) types.push("READY_FOR_DELIVERY");
        if (order.order_status === "CLOSED") types.push("ORDER_CLOSED");
        if (["INVOICED", "PAID"].includes(order.financial_status)) types.push("INVOICE_GENERATED");

        for (const t of types) {
            await db.insert(schema.notificationLogs).values({
                platform_id: S.platform.id,
                order_id: order.id,
                notification_type: t,
                recipients: JSON.stringify({ to: [user?.email || "client@test.com"], cc: ["admin@test.com"] }),
                status: "SENT" as const,
                attempts: 1,
                last_attempt_at: new Date(),
                sent_at: new Date(),
                message_id: `msg_${Date.now()}_${count}`,
                error_message: null,
            });
            count++;
        }
    }
    console.log(`✓ ${count} notification logs`);
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
            company: pr, requester: prClient,
            status: "PRICING_REVIEW" as const,
            financial: "PENDING_QUOTE" as const,
            incomingAt: daysFromNow(5),
            note: "New batch of Absolut branded glassware arriving from supplier",
            items: [
                { name: "Absolut Branded Martini Glass", category: "Glassware", tracking: "BATCH" as TrackingMethod, qty: 40, weight: 0.28, volume: 0.003, dims: { length: 12, width: 12, height: 18 }, brand: "Absolut" },
                { name: "Absolut Ice Bucket", category: "Decor", tracking: "BATCH" as TrackingMethod, qty: 15, weight: 1.5, volume: 0.01, dims: { length: 25, width: 25, height: 30 }, brand: "Absolut" },
            ],
            label: "New — needs pricing review",
        },
        {
            id: "IR-20260210-002",
            company: pr, requester: prClient,
            status: "CONFIRMED" as const,
            financial: "QUOTE_ACCEPTED" as const,
            incomingAt: daysFromNow(3),
            note: "Chivas Regal lounge furniture from fabricator",
            items: [
                { name: "Chivas Regal Branded Sofa", category: "Furniture", tracking: "INDIVIDUAL" as TrackingMethod, qty: 1, weight: 60, volume: 1.5, dims: { length: 200, width: 85, height: 80 }, brand: "Chivas Regal" },
                { name: "Chivas Regal Coffee Table", category: "Furniture", tracking: "INDIVIDUAL" as TrackingMethod, qty: 1, weight: 25, volume: 0.6, dims: { length: 120, width: 60, height: 45 }, brand: "Chivas Regal" },
            ],
            label: "Approved — awaiting receipt",
        },
        {
            id: "IR-20260205-003",
            company: dg, requester: dgClient,
            status: "COMPLETED" as const,
            financial: "INVOICED" as const,
            incomingAt: daysFromNow(-5),
            note: "Johnnie Walker branded bar stools from supplier",
            items: [
                { name: "JW Black Label Bar Stool", category: "Furniture", tracking: "INDIVIDUAL" as TrackingMethod, qty: 1, weight: 9, volume: 0.25, dims: { length: 45, width: 45, height: 105 }, brand: "Johnnie Walker" },
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
                margin: { percent: marginPercent, amount: marginAmt, is_override: false, override_reason: null },
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
                requester_id: def.requester.id,
                incoming_at: def.incomingAt,
                note: def.note,
                request_status: def.status,
                financial_status: def.financial,
                request_pricing_id: price.id,
            })
            .returning();

        // Insert items
        for (const item of def.items) {
            const brand = S.brands.find((b: any) => b.name === item.brand && b.company_id === def.company.id);
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
    S.inboundRequests.forEach((ir: any) => console.log(`  ${ir.inbound_request_id} [${ir.request_status}] — ${ir._label}`));
}

// ============================================================
// CLEANUP
// ============================================================

async function cleanup() {
    console.log("🧹 Cleaning up existing data...");
    try {
        try {
            await db.execute(sql`UPDATE transport_rates SET trip_type = 'ONE_WAY' WHERE trip_type = 'ADDITIONAL'`);
        } catch (_) { /* ignore */ }

        // Delete in reverse dependency order
        await db.delete(schema.notificationLogs);
        await db.delete(schema.assetVersions);
        await db.delete(schema.assetConditionHistory);
        await db.delete(schema.scanEvents);
        await db.delete(schema.financialStatusHistory);
        await db.delete(schema.orderStatusHistory);
        await db.delete(schema.invoices);
        await db.delete(schema.assetBookings);
        await db.delete(schema.lineItems);
        await db.delete(schema.reskinRequests);
        await db.delete(schema.orderItems);
        await db.delete(schema.orders);
        await db.delete(schema.inboundRequestItems);
        await db.delete(schema.inboundRequests);
        await db.delete(schema.prices);
        await db.delete(schema.collectionItems);
        await db.delete(schema.collections);
        await db.delete(schema.assets);
        await db.delete(schema.serviceTypes);
        await db.delete(schema.transportRates);
        await db.delete(schema.cities);
        await db.delete(schema.countries);
        await db.delete(schema.zones);
        await db.delete(schema.brands);
        await db.delete(schema.companyDomains);
        await db.delete(schema.users);
        await db.delete(schema.companies);
        await db.delete(schema.warehouses);
        await db.delete(schema.vehicleTypes);
        await db.delete(schema.platforms);
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
        await seedReskinRequests();
        await seedLineItems();
        await seedAssetBookings();

        // Phase 5: Scanning & conditions
        await seedScanEvents();
        await seedConditionHistory();
        await seedAssetVersions();

        // Phase 6: History, invoices, notifications
        await seedOrderHistory();
        await seedInvoices();
        await seedNotificationLogs();

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
