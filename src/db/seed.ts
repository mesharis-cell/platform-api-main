/**
 * COMPREHENSIVE DATABASE SEED
 *
 * Seeds complete development data including:
 * - 2 platforms with realistic configurations
 * - Multiple companies, users, warehouses
 * - Extensive asset catalog with images
 * - Orders in various states
 * - Complete pricing, scanning, and invoice data
 *
 * Run: tsx src/db/seed.ts
 */

import { db } from "./index";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";

type TrackingMethod = "INDIVIDUAL" | "BATCH";
type AssetCondition = "GREEN" | "ORANGE" | "RED";
type ScanType = "OUTBOUND" | "INBOUND";
type NotificationStatus = "QUEUED" | "SENT" | "FAILED" | "RETRYING";
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
// HELPER FUNCTIONS
// ============================================================

/**
 * Generate realistic product images using placeholder services
 * Uses placehold.co with category labels and varied colors
 */
const generateAssetImages = (category: string, assetName: string, count: number = 3): string[] => {
    // Color schemes per category for visual distinction
    const categoryColors: Record<string, string[]> = {
        Furniture: ["8B4513", "654321", "A0522D", "CD853F", "D2691E"],
        Glassware: ["4682B4", "87CEEB", "B0E0E6", "5F9EA0", "6495ED"],
        Installation: ["696969", "808080", "A9A9A9", "778899", "2F4F4F"],
        Decor: ["FF69B4", "FFB6C1", "FFC0CB", "FF1493", "C71585"],
        Lighting: ["FFD700", "FFA500", "FFFF00", "F0E68C", "EEE8AA"],
    };

    const colors = categoryColors[category] || ["CCCCCC", "999999", "666666"];
    const images: string[] = [];

    // Shorten asset name for display
    const shortName = assetName.length > 20 ? assetName.substring(0, 18) + ".." : assetName;

    for (let i = 0; i < count; i++) {
        const color = colors[i % colors.length];
        const textColor = "FFFFFF"; // White text

        // Different views: Front, Side, Detail
        const viewLabel = i === 0 ? "Front" : i === 1 ? "Side" : "Detail";
        const text = `${category}\\n${shortName}\\n(${viewLabel})`;

        // Use placehold.co - modern, reliable, no CORS issues
        images.push(
            `https://placehold.co/800x600/${color}/${textColor}?text=${encodeURIComponent(text)}`
        );
    }

    return images;
};

/**
 * Generate brand logo URL
 */
const generateBrandLogo = (brandName: string): string => {
    // Use placeholder with brand name - reliable and descriptive
    const text = `${brandName}\\nLogo`;
    const color = "2563eb"; // Blue brand color
    return `https://placehold.co/400x200/${color}/FFFFFF?text=${encodeURIComponent(text)}`;
};

/**
 * Generate QR code (unique identifier)
 */
const generateQRCode = (): string => {
    return `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

/**
 * Generate order ID (ORD-YYYYMMDD-XXX)
 */
const generateOrderId = (date: Date, sequence: number): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const seq = String(sequence).padStart(3, "0");
    return `ORD-${year}${month}${day}-${seq}`;
};

/**
 * Generate invoice ID (INV-YYYYMMDD-XXX)
 */
const generateInvoiceId = (date: Date, sequence: number): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const seq = String(sequence).padStart(3, "0");
    return `INV-${year}${month}${day}-${seq}`;
};

/**
 * Hash password using bcrypt
 */
const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, 10);
};

/**
 * Generate random date within range
 */
const randomDate = (start: Date, end: Date): Date => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

/**
 * Get random item from array
 */
const randomItem = <T>(array: T[]): T => {
    return array[Math.floor(Math.random() * array.length)];
};

// ============================================================
// SEED DATA STORAGE (for cross-referencing)
// ============================================================

const seededData = {
    platforms: [] as any[],
    companies: [] as any[],
    countries: [] as any[],
    companyDomains: [] as any[],
    users: [] as any[],
    warehouses: [] as any[],
    brands: [] as any[],
    zones: [] as any[],
    pricingConfigs: [] as any[],
    transportRates: [] as any[],
    serviceTypes: [] as any[],
    assets: [] as any[],
    collections: [] as any[],
    collectionItems: [] as any[],
    orders: [] as any[],
    orderItems: [] as any[],
    reskinRequests: [] as any[],
    orderLineItems: [] as any[],
    ordersWithReskin: [] as string[], // Track which order IDs should have reskin
};

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function seedPlatforms() {
    console.log("🌐 Seeding platforms...");

    const platforms = await db
        .insert(schema.platforms)
        .values([
            {
                name: "Development Platform",
                domain: "localhost:4000",
                config: {
                    logo_url: "https://via.placeholder.com/200x80/f97316/ffffff?text=DEV+Platform",
                    primary_color: "#f97316",
                    secondary_color: "#0ea5e9",
                    logistics_partner_name: "A2 Logistics",
                    support_email: "support@dev-platform.com",
                    currency: "AED",
                },
                features: {
                    collections: true,
                    bulk_import: true,
                    advanced_reporting: true,
                    api_access: true,
                },
                is_active: true,
            },
            {
                name: "Production Demo Platform",
                domain: "demo.platform.com",
                config: {
                    logo_url: "https://via.placeholder.com/200x80/3b82f6/ffffff?text=DEMO+Platform",
                    primary_color: "#3b82f6",
                    secondary_color: "#10b981",
                    logistics_partner_name: "Premium Logistics",
                    support_email: "support@demo-platform.com",
                    currency: "USD",
                },
                features: {
                    collections: true,
                    bulk_import: false,
                    advanced_reporting: false,
                    api_access: false,
                },
                is_active: true,
            },
        ])
        .returning();

    seededData.platforms = platforms;
    console.log(`✓ Created ${platforms.length} platforms`);
}

async function seedCountries() {
    console.log("🌐 Seeding countries...");

    for (const platform of seededData.platforms) {
        const countries = await db
            .insert(schema.countries)
            .values([
                {
                    platform_id: platform.id,
                    name: "United Arab Emirates",
                }
            ])
            .returning();

        seededData.countries = countries;
        console.log(`✓ Created ${countries.length} countries for ${platform.name}`);
    }
}

async function seedCompanies() {
    console.log("🏢 Seeding companies...");

    const platform1 = seededData.platforms[0];
    const platform2 = seededData.platforms[1];

    const companies = await db
        .insert(schema.companies)
        .values([
            // Platform 1 companies
            {
                platform_id: platform1.id,
                name: "Diageo",
                domain: "diageo",
                settings: {
                    branding: {
                        title: "Diageo Events",
                        logo_url: generateBrandLogo("Diageo"),
                        primary_color: "#8B0000",
                        secondary_color: "#FFD700",
                    },
                },
                platform_margin_percent: "25.00",
                contact_email: "events@diageo.com",
                contact_phone: "+971-50-123-4567",
                is_active: true,
            },
            {
                platform_id: platform1.id,
                name: "Unilever",
                domain: "unilever",
                settings: {
                    branding: {
                        title: "Unilever Corporate Events",
                        logo_url: generateBrandLogo("Unilever"),
                        primary_color: "#0057B7",
                        secondary_color: "#FFFFFF",
                    },
                },
                platform_margin_percent: "22.00",
                contact_email: "corporate@unilever.com",
                contact_phone: "+971-50-234-5678",
                is_active: true,
            },
            {
                platform_id: platform1.id,
                name: "Procter & Gamble",
                domain: "pg",
                settings: {
                    branding: {
                        title: "P&G Events",
                        logo_url: generateBrandLogo("Procter and Gamble"),
                        primary_color: "#003DA5",
                        secondary_color: "#FFFFFF",
                    },
                },
                platform_margin_percent: "28.00",
                contact_email: "events@pg.com",
                contact_phone: "+971-50-345-6789",
                is_active: true,
            },
            // Platform 2 companies
            {
                platform_id: platform2.id,
                name: "Coca-Cola",
                domain: "coca-cola",
                settings: {
                    branding: {
                        title: "Coca-Cola Experiences",
                        logo_url: generateBrandLogo("Coca-Cola"),
                        primary_color: "#F40009",
                        secondary_color: "#FFFFFF",
                    },
                },
                platform_margin_percent: "25.00",
                contact_email: "experiences@coca-cola.com",
                contact_phone: "+1-404-555-0100",
                is_active: true,
            },
            {
                platform_id: platform2.id,
                name: "Nike",
                domain: "nike",
                settings: {
                    branding: {
                        title: "Nike Events",
                        logo_url: generateBrandLogo("Nike"),
                        primary_color: "#000000",
                        secondary_color: "#FF6B00",
                    },
                },
                platform_margin_percent: "30.00",
                contact_email: "events@nike.com",
                contact_phone: "+1-503-555-0200",
                is_active: true,
            },
        ])
        .returning();

    seededData.companies = companies;
    console.log(`✓ Created ${companies.length} companies`);
}

async function seedCompanyDomains() {
    console.log("🌍 Seeding company domains...");

    const platform1 = seededData.platforms[0];
    const domains = [];

    for (const company of seededData.companies) {
        // Vanity domain (companyname.platformdomain.com)
        domains.push({
            platform_id: company.platform_id,
            company_id: company.id,
            hostname: `${company.domain}.${company.platform_id === platform1.id ? "localhost:4001" : "demo.platform.com"}`,
            type: "VANITY" as const,
            is_verified: true,
            is_active: true,
        });

        // Custom domain (for some companies)
        if (["diageo", "unilever", "coca-cola"].includes(company.domain)) {
            domains.push({
                platform_id: company.platform_id,
                company_id: company.id,
                hostname: `events.${company.domain}.com`,
                type: "CUSTOM" as const,
                is_verified: true,
                is_active: true,
            });
        }
    }

    const inserted = await db.insert(schema.companyDomains).values(domains).returning();
    seededData.companyDomains = inserted;
    console.log(`✓ Created ${inserted.length} company domains`);
}

async function seedWarehouses() {
    console.log("🏭 Seeding warehouses...");

    const platform1 = seededData.platforms[0];
    const platform2 = seededData.platforms[1];

    const warehouses = await db
        .insert(schema.warehouses)
        .values([
            // Platform 1 warehouses
            {
                platform_id: platform1.id,
                name: "Dubai Main Warehouse",
                country: "United Arab Emirates",
                city: "Dubai",
                address: "Dubai Industrial City, Plot 598-1234",
                coordinates: { lat: 25.0657, lng: 55.1713 },
                is_active: true,
            },
            {
                platform_id: platform1.id,
                name: "Abu Dhabi Storage",
                country: "United Arab Emirates",
                city: "Abu Dhabi",
                address: "Mussafah Industrial Area, M-35",
                coordinates: { lat: 24.3598, lng: 54.5011 },
                is_active: true,
            },
            // Platform 2 warehouse
            {
                platform_id: platform2.id,
                name: "Dubai Premium Facility",
                country: "United Arab Emirates",
                city: "Dubai",
                address: "Al Quoz Industrial Area 4",
                coordinates: { lat: 25.1358, lng: 55.2328 },
                is_active: true,
            },
        ])
        .returning();

    seededData.warehouses = warehouses;
    console.log(`✓ Created ${warehouses.length} warehouses`);
}

async function seedUsers() {
    console.log("👥 Seeding users...");

    const platform1 = seededData.platforms[0];
    const platform2 = seededData.platforms[1];
    const hashedPassword = await hashPassword("password123");

    const users = [];

    // Platform 1 users
    users.push(
        // Platform Admins
        {
            platform_id: platform1.id,
            company_id: null,
            name: "Admin User",
            email: "admin@test.com",
            password: hashedPassword,
            role: "ADMIN" as const,
            permissions: [
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
            ],
            permission_template: "PLATFORM_ADMIN" as const,
            is_active: true,
        },
        {
            platform_id: platform1.id,
            company_id: null,
            name: "Sarah Johnson",
            email: "sarah.admin@platform.com",
            password: hashedPassword,
            role: "ADMIN" as const,
            permissions: [
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
            ],
            permission_template: "PLATFORM_ADMIN" as const,
            is_active: true,
        },
        // Logistics Staff
        {
            platform_id: platform1.id,
            company_id: null,
            name: "Logistics User",
            email: "logistics@test.com",
            password: hashedPassword,
            role: "LOGISTICS" as const,
            permissions: [
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
                "pricing:approve_standard",
                "pricing:adjust",
                "lifecycle:progress_status",
                "lifecycle:receive_notifications",
                "scanning:*",
                "inventory:*",
                "conditions:*",
            ],
            permission_template: "LOGISTICS_STAFF" as const,
            is_active: true,
        },
        {
            platform_id: platform1.id,
            company_id: null,
            name: "Ahmed Al-Rashid",
            email: "ahmed.logistics@a2logistics.com",
            password: hashedPassword,
            role: "LOGISTICS" as const,
            permissions: [
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
                "pricing:approve_standard",
                "pricing:adjust",
                "lifecycle:progress_status",
                "lifecycle:receive_notifications",
                "scanning:*",
                "inventory:*",
                "conditions:*",
            ],
            permission_template: "LOGISTICS_STAFF" as const,
            is_active: true,
        },
        {
            platform_id: platform1.id,
            company_id: null,
            name: "Maria Garcia",
            email: "maria.ops@a2logistics.com",
            password: hashedPassword,
            role: "LOGISTICS" as const,
            permissions: [
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
                "pricing:approve_standard",
                "pricing:adjust",
                "lifecycle:progress_status",
                "lifecycle:receive_notifications",
                "scanning:*",
                "inventory:*",
                "conditions:*",
            ],
            permission_template: "LOGISTICS_STAFF" as const,
            is_active: true,
        }
    );

    // Client users for each company
    for (const company of seededData.companies.slice(0, 3)) {
        // Platform 1 companies
        users.push({
            platform_id: platform1.id,
            company_id: company.id,
            name: `${company.name} Event Manager`,
            email: `client@${company.domain}.com`,
            password: hashedPassword,
            role: "CLIENT" as const,
            permissions: [
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
            ],
            permission_template: "CLIENT_USER" as const,
            is_active: true,
        });

        users.push({
            platform_id: platform1.id,
            company_id: company.id,
            name: `${company.name} Coordinator`,
            email: `coordinator@${company.domain}.com`,
            password: hashedPassword,
            role: "CLIENT" as const,
            permissions: [
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
            ],
            permission_template: "CLIENT_USER" as const,
            is_active: true,
        });
    }

    // Platform 2 users
    for (const company of seededData.companies.slice(3)) {
        // Platform 2 companies
        users.push({
            platform_id: platform2.id,
            company_id: company.id,
            name: `${company.name} Manager`,
            email: `manager@${company.domain}.com`,
            password: hashedPassword,
            role: "CLIENT" as const,
            permissions: [
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
            ],
            permission_template: "CLIENT_USER" as const,
            is_active: true,
        });
    }

    const inserted = await db.insert(schema.users).values(users).returning();
    seededData.users = inserted;
    console.log(`✓ Created ${inserted.length} users`);
    console.log(`  📧 Test credentials: admin@test.com / password123`);
    console.log(`  📧 Logistics: logistics@test.com / password123`);
    console.log(`  📧 Client: client@diageo.com / password123`);
}

async function seedBrands() {
    console.log("🏷️  Seeding brands...");

    const brands = [];

    for (const company of seededData.companies) {
        const brandNames =
            company.name === "Diageo"
                ? ["Johnnie Walker", "Guinness", "Baileys"]
                : company.name === "Unilever"
                    ? ["Dove", "Axe", "Lipton"]
                    : company.name === "Procter & Gamble"
                        ? ["Gillette", "Pantene", "Oral-B"]
                        : company.name === "Coca-Cola"
                            ? ["Coca-Cola Classic", "Sprite", "Fanta"]
                            : ["Air Jordan", "Nike SB", "Nike ACG"];

        for (const brandName of brandNames) {
            brands.push({
                platform_id: company.platform_id,
                company_id: company.id,
                name: brandName,
                description: `${brandName} brand activation and events`,
                logo_url: generateBrandLogo(brandName),
                is_active: true,
            });
        }
    }

    const inserted = await db.insert(schema.brands).values(brands).returning();
    seededData.brands = inserted;
    console.log(`✓ Created ${inserted.length} brands`);
}

async function seedZones() {
    console.log("📦 Seeding warehouse zones...");

    const zones = [];

    for (const warehouse of seededData.warehouses) {
        // Get companies from same platform
        const platformCompanies = seededData.companies.filter(
            (c) => c.platform_id === warehouse.platform_id
        );

        // Create 2 zones per company in this warehouse
        for (const company of platformCompanies) {
            zones.push(
                {
                    platform_id: warehouse.platform_id,
                    warehouse_id: warehouse.id,
                    company_id: company.id,
                    name: `${company.name.substring(0, 3).toUpperCase()}-A`,
                    description: `${company.name} primary storage zone`,
                    capacity: 500,
                    is_active: true,
                },
                {
                    platform_id: warehouse.platform_id,
                    warehouse_id: warehouse.id,
                    company_id: company.id,
                    name: `${company.name.substring(0, 3).toUpperCase()}-B`,
                    description: `${company.name} overflow storage`,
                    capacity: 300,
                    is_active: true,
                }
            );
        }
    }

    const inserted = await db.insert(schema.zones).values(zones).returning();
    seededData.zones = inserted;
    console.log(`✓ Created ${inserted.length} zones`);
}

async function seedPricingConfig() {
    console.log("💰 Seeding pricing configuration...");

    const configs = [];

    // Platform-wide default for platform 1
    configs.push({
        platform_id: seededData.platforms[0].id,
        company_id: null,
        warehouse_ops_rate: "150.00", // AED per m³
        is_active: true,
    });

    // Company-specific pricing (Diageo gets custom rate)
    const diageo = seededData.companies.find((c) => c.name === "Diageo");
    if (diageo) {
        configs.push({
            platform_id: diageo.platform_id,
            company_id: diageo.id,
            warehouse_ops_rate: "135.00", // Discounted rate
            is_active: true,
        });
    }

    const inserted = await db.insert(schema.pricingConfig).values(configs).returning();
    seededData.pricingConfigs = inserted;
    console.log(`✓ Created ${inserted.length} pricing configs`);
}

async function seedTransportRates() {
    console.log("🚚 Seeding transport rates...");

    const platform1 = seededData.platforms[0];

    const [country] = await db
        .select()
        .from(schema.countries)
        .where(eq(schema.countries.platform_id, platform1.id))
        .limit(1);

    if (!country) {
        throw new Error("Country not found to create city");
    }

    const cities = [
        "Dubai",
        "Abu Dhabi",
        "Sharjah",
        "Ajman",
        "Ras Al Khaimah",
        "Fujairah",
        "Umm Al Quwain",
    ];

    const citiesData = cities.map((city) => ({
        platform_id: platform1.id,
        country_id: country.id,
        name: city,
    }));

    const insertedCities = await db.insert(schema.cities).values(citiesData).returning();

    console.log(`✓ Created ${insertedCities.length} cities for ${country.name} in ${platform1.name}`);

    const tripTypes: ("ONE_WAY" | "ROUND_TRIP")[] = ["ONE_WAY", "ROUND_TRIP"];
    const vehicleTypes: ("STANDARD" | "7_TON" | "10_TON")[] = ["STANDARD", "7_TON", "10_TON"];

    const rates = [];

    for (const city of insertedCities) {
        for (const tripType of tripTypes) {
            for (const vehicleType of vehicleTypes) {
                const baseRate =
                    vehicleType === "STANDARD" ? 500 : vehicleType === "7_TON" ? 800 : 1200;
                const tripMultiplier = tripType === "ROUND_TRIP" ? 1.8 : 1;
                const rate = baseRate * tripMultiplier;

                rates.push({
                    platform_id: platform1.id,
                    company_id: null,
                    city_id: city.id,
                    area: null,
                    trip_type: tripType,
                    vehicle_type: vehicleType,
                    rate: rate.toString(),
                    is_active: true,
                });
            }
        }
    }

    const inserted = await db.insert(schema.transportRates).values(rates).returning();
    seededData.transportRates = inserted;
    console.log(`✓ Created ${inserted.length} transport rates`);
}

async function seedServiceTypes() {
    console.log("🛠️  Seeding service types...");

    const platform1 = seededData.platforms[0];

    const services = [
        // Assembly services
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

        // Equipment services
        {
            name: "Forklift Operation",
            category: "EQUIPMENT" as const,
            unit: "hour",
            default_rate: "200.00",
            description: "Forklift and heavy equipment operation",
        },
        {
            name: "Crane Service",
            category: "EQUIPMENT" as const,
            unit: "day",
            default_rate: "1500.00",
            description: "Mobile crane rental with operator",
        },

        // Handling services
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

        // Reskin services
        {
            name: "Vinyl Wrap Application",
            category: "RESKIN" as const,
            unit: "unit",
            default_rate: "300.00",
            description: "Custom vinyl wrapping for furniture",
        },
        {
            name: "Custom Fabrication",
            category: "RESKIN" as const,
            unit: "unit",
            default_rate: null,
            description: "Custom fabrication and branding (quote required)",
        },
        {
            name: "Graphic Installation",
            category: "RESKIN" as const,
            unit: "unit",
            default_rate: "150.00",
            description: "Installation of custom graphics",
        },

        // Other services
        {
            name: "Storage Fee",
            category: "OTHER" as const,
            unit: "day",
            default_rate: "50.00",
            description: "Daily storage charge for extended periods",
        },
        {
            name: "Rush Service",
            category: "OTHER" as const,
            unit: "trip",
            default_rate: "750.00",
            description: "Expedited delivery/pickup",
        },
        {
            name: "After Hours Service",
            category: "OTHER" as const,
            unit: "hour",
            default_rate: "180.00",
            description: "Services outside business hours",
        },
        {
            name: "Cleaning Service",
            category: "OTHER" as const,
            unit: "unit",
            default_rate: "35.00",
            description: "Deep cleaning of returned items",
        },
    ];

    const serviceValues = services.map((svc, idx) => ({
        platform_id: platform1.id,
        name: svc.name,
        category: svc.category,
        unit: svc.unit,
        default_rate: svc.default_rate,
        description: svc.description,
        display_order: idx,
        is_active: true,
    }));

    const inserted = await db.insert(schema.serviceTypes).values(serviceValues).returning();
    seededData.serviceTypes = inserted;
    console.log(`✓ Created ${inserted.length} service types`);
}

async function seedAssets() {
    console.log("🎨 Seeding assets (with images)...");

    const assets = [];
    let assetCount = 0;

    // Asset catalog templates
    const assetTemplates = {
        Furniture: [
            {
                name: "Executive Round Table",
                description: "Premium 6-seater round table",
                weight: 45,
                dims: { length: 150, width: 150, height: 75 },
                volume: 1.688,
            },
            {
                name: "Chiavari Gold Chair",
                description: "Classic gold chiavari chair",
                weight: 5.5,
                dims: { length: 40, width: 45, height: 90 },
                volume: 0.162,
            },
            {
                name: "Velvet Lounge Sofa",
                description: "3-seater luxury velvet sofa",
                weight: 65,
                dims: { length: 210, width: 90, height: 85 },
                volume: 1.606,
            },
            {
                name: "Bar Stool High",
                description: "Modern metal bar stool",
                weight: 8,
                dims: { length: 45, width: 45, height: 110 },
                volume: 0.223,
            },
            {
                name: "Cocktail Table Round",
                description: "High-top cocktail table",
                weight: 18,
                dims: { length: 80, width: 80, height: 110 },
                volume: 0.704,
            },
            {
                name: "Banquet Rectangle Table",
                description: "8-seater rectangular table",
                weight: 52,
                dims: { length: 240, width: 100, height: 75 },
                volume: 1.8,
            },
            {
                name: "Ghost Chair Clear",
                description: "Transparent acrylic chair",
                weight: 6,
                dims: { length: 46, width: 54, height: 94 },
                volume: 0.233,
            },
            {
                name: "Luxury Ottoman",
                description: "Velvet upholstered ottoman",
                weight: 12,
                dims: { length: 60, width: 60, height: 45 },
                volume: 0.162,
            },
            {
                name: "Stage Platform 2x2m",
                description: "Modular stage platform",
                weight: 85,
                dims: { length: 200, width: 200, height: 40 },
                volume: 1.6,
            },
            {
                name: "DJ Booth Custom",
                description: "Professional DJ booth setup",
                weight: 95,
                dims: { length: 180, width: 80, height: 110 },
                volume: 1.584,
            },
        ],
        Glassware: [
            {
                name: "Wine Glass Bordeaux",
                description: "Premium crystal wine glass",
                weight: 0.25,
                dims: { length: 10, width: 10, height: 24 },
                volume: 0.002,
            },
            {
                name: "Champagne Flute",
                description: "Elegant champagne flute",
                weight: 0.22,
                dims: { length: 8, width: 8, height: 26 },
                volume: 0.002,
            },
            {
                name: "Whisky Tumbler",
                description: "Heavy base whisky glass",
                weight: 0.35,
                dims: { length: 9, width: 9, height: 10 },
                volume: 0.001,
            },
            {
                name: "Martini Glass",
                description: "Classic martini cocktail glass",
                weight: 0.28,
                dims: { length: 12, width: 12, height: 18 },
                volume: 0.003,
            },
            {
                name: "Highball Glass",
                description: "Tall highball tumbler",
                weight: 0.3,
                dims: { length: 7, width: 7, height: 15 },
                volume: 0.001,
            },
            {
                name: "Crystal Decanter",
                description: "Lead crystal wine decanter",
                weight: 1.2,
                dims: { length: 15, width: 15, height: 30 },
                volume: 0.007,
            },
        ],
        Installation: [
            {
                name: "Backdrop Frame 4x3m",
                description: "Aluminum photo backdrop frame",
                weight: 28,
                dims: { length: 400, width: 10, height: 300 },
                volume: 1.2,
            },
            {
                name: "Wedding Arch Floral",
                description: "Decorative floral arch structure",
                weight: 22,
                dims: { length: 250, width: 80, height: 280 },
                volume: 5.6,
            },
            {
                name: "Pipe and Drape System",
                description: "3m high drape system per 3m",
                weight: 15,
                dims: { length: 300, width: 10, height: 300 },
                volume: 0.9,
            },
            {
                name: "Truss Structure 3m",
                description: "Aluminum lighting truss section",
                weight: 32,
                dims: { length: 300, width: 30, height: 30 },
                volume: 0.27,
            },
            {
                name: "Red Carpet Runner 10m",
                description: "VIP red carpet runner",
                weight: 18,
                dims: { length: 1000, width: 120, height: 2 },
                volume: 0.24,
            },
        ],
        Decor: [
            {
                name: "Floral Centerpiece Luxury",
                description: "Premium floral arrangement",
                weight: 3.5,
                dims: { length: 40, width: 40, height: 50 },
                volume: 0.08,
            },
            {
                name: "LED Uplighter RGB",
                description: "Wireless RGB uplight",
                weight: 2.8,
                dims: { length: 15, width: 15, height: 30 },
                volume: 0.007,
            },
            {
                name: "Crystal Chandelier",
                description: "Suspended crystal chandelier",
                weight: 45,
                dims: { length: 100, width: 100, height: 150 },
                volume: 1.5,
            },
            {
                name: "Neon Sign Custom",
                description: "Custom LED neon sign",
                weight: 5,
                dims: { length: 120, width: 10, height: 60 },
                volume: 0.072,
            },
            {
                name: "Balloon Arch Kit",
                description: "Complete balloon arch set",
                weight: 2,
                dims: { length: 300, width: 50, height: 250 },
                volume: 3.75,
            },
            {
                name: "Mirror Ball 50cm",
                description: "Disco mirror ball with motor",
                weight: 8,
                dims: { length: 50, width: 50, height: 50 },
                volume: 0.125,
            },
        ],
        Lighting: [
            {
                name: "Par LED Moving Head",
                description: "Professional moving head light",
                weight: 12,
                dims: { length: 30, width: 30, height: 45 },
                volume: 0.041,
            },
            {
                name: "Wash Light Bar",
                description: "4-head LED wash bar",
                weight: 8.5,
                dims: { length: 120, width: 15, height: 20 },
                volume: 0.036,
            },
            {
                name: "Gobo Projector",
                description: "Custom gobo projection light",
                weight: 6,
                dims: { length: 25, width: 25, height: 35 },
                volume: 0.022,
            },
            {
                name: "Fairy Lights 20m",
                description: "Warm white fairy light string",
                weight: 0.8,
                dims: { length: 2000, width: 5, height: 5 },
                volume: 0.05,
            },
        ],
    };

    // Create assets for each company
    for (const company of seededData.companies) {
        const companyBrands = seededData.brands.filter((b) => b.company_id === company.id);
        const companyZones = seededData.zones.filter((z) => z.company_id === company.id);

        if (companyZones.length === 0) continue;

        const warehouse = seededData.warehouses.find((w) => w.id === companyZones[0].warehouse_id);
        if (!warehouse) continue;

        // Create assets across all categories
        for (const [category, templates] of Object.entries(assetTemplates)) {
            for (const template of templates) {
                // Randomly assign to a zone and brand
                const zone = randomItem(companyZones);
                const brand =
                    companyBrands.length > 0
                        ? Math.random() > 0.3
                            ? randomItem(companyBrands)
                            : null
                        : null;

                // Determine tracking method
                const trackingMethod =
                    category === "Glassware" || category === "Decor" ? "BATCH" : "INDIVIDUAL";
                const totalQty =
                    trackingMethod === "BATCH" ? Math.floor(Math.random() * 100) + 20 : 1;
                const availableQty = Math.floor(totalQty * (0.7 + Math.random() * 0.3)); // 70-100% available

                // Determine condition (80% GREEN, 15% ORANGE, 5% RED)
                const conditionRand = Math.random();
                const condition =
                    conditionRand < 0.8 ? "GREEN" : conditionRand < 0.95 ? "ORANGE" : "RED";

                // Determine status based on condition
                let status: "AVAILABLE" | "BOOKED" | "OUT" | "MAINTENANCE";
                if (condition === "RED") {
                    status = "MAINTENANCE";
                } else {
                    const statusRand = Math.random();
                    status = statusRand < 0.7 ? "AVAILABLE" : statusRand < 0.9 ? "BOOKED" : "OUT";
                }

                // Generate images (3 per asset)
                const assetName = `${template.name}${brand ? ` - ${brand.name}` : ""}`;
                const images = generateAssetImages(category, assetName, 3);

                // Condition history
                const conditionHistory = [];
                if (condition !== "GREEN") {
                    conditionHistory.push({
                        condition: condition,
                        notes:
                            condition === "ORANGE"
                                ? "Minor scratches on surface, functional"
                                : "Damaged during transport, needs repair",
                        updated_by: seededData.users[0].id,
                        timestamp: new Date(
                            Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000
                        ).toISOString(),
                    });
                }

                assets.push({
                    platform_id: company.platform_id,
                    company_id: company.id,
                    warehouse_id: warehouse.id,
                    zone_id: zone.id,
                    brand_id: brand?.id || null,
                    name: assetName,
                    description: template.description,
                    category: category,
                    images: images,
                    tracking_method: trackingMethod as TrackingMethod,
                    total_quantity: totalQty,
                    available_quantity: availableQty,
                    qr_code: generateQRCode(),
                    packaging: trackingMethod === "BATCH" ? "Plastic crate 60x40x30cm" : null,
                    weight_per_unit: template.weight.toString(),
                    dimensions: template.dims,
                    volume_per_unit: template.volume.toString(),
                    condition: condition as AssetCondition,
                    condition_notes:
                        condition !== "GREEN"
                            ? condition === "ORANGE"
                                ? "Usable with minor wear"
                                : "Requires maintenance"
                            : null,
                    refurb_days_estimate:
                        condition === "RED"
                            ? Math.floor(Math.random() * 5) + 3
                            : condition === "ORANGE"
                                ? Math.floor(Math.random() * 2) + 1
                                : null,
                    condition_history: conditionHistory,
                    handling_tags:
                        category === "Glassware"
                            ? ["Fragile", "HighValue"]
                            : category === "Furniture" && template.weight > 50
                                ? ["HeavyLift"]
                                : category === "Installation"
                                    ? ["AssemblyRequired"]
                                    : [],
                    status: status,
                    last_scanned_at:
                        status !== "AVAILABLE"
                            ? randomDate(
                                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                                new Date()
                            )
                            : null,
                    last_scanned_by:
                        status !== "AVAILABLE"
                            ? randomItem(seededData.users.filter((u) => u.role !== "CLIENT")).id
                            : null,
                    transformed_from: null,
                    transformed_to: null,
                });

                assetCount++;
            }
        }
    }

    const inserted = await db.insert(schema.assets).values(assets).returning();
    seededData.assets = inserted;
    console.log(`✓ Created ${inserted.length} assets with ${inserted.length * 3} images`);
    console.log(`  🖼️  Image sources: placehold.co (category-labeled placeholders)`);
}

async function seedCollections() {
    console.log("📚 Seeding collections (with images)...");

    const collections = [];

    for (const company of seededData.companies) {
        const companyAssets = seededData.assets.filter((a) => a.company_id === company.id);
        const companyBrands = seededData.brands.filter((b) => b.company_id === company.id);

        if (companyAssets.length === 0) continue;

        // Create 4 collections per company
        const collectionTemplates = [
            {
                name: "Executive Dinner Setup",
                description: "Complete setup for executive dinners (10 pax)",
                category: "Dining",
            },
            {
                name: "Cocktail Reception Package",
                description: "Full cocktail event setup",
                category: "Cocktail",
            },
            {
                name: "VIP Lounge Collection",
                description: "Premium lounge furniture set",
                category: "Lounge",
            },
            {
                name: "Brand Activation Kit",
                description: "Complete brand activation setup",
                category: "Branding",
            },
        ];

        for (const template of collectionTemplates) {
            const brand =
                companyBrands.length > 0 && Math.random() > 0.5 ? randomItem(companyBrands) : null;

            // Generate collection images (hero images)
            const collectionName = `${template.name}${brand ? ` - ${brand.name}` : ""}`;
            const shortCollection =
                collectionName.length > 30
                    ? collectionName.substring(0, 28) + ".."
                    : collectionName;
            const images = [
                `https://placehold.co/1200x800/059669/FFFFFF?text=${encodeURIComponent(shortCollection + "\\nSetup")}`,
                `https://placehold.co/1200x800/0891b2/FFFFFF?text=${encodeURIComponent(shortCollection + "\\nDetail")}`,
            ];

            collections.push({
                platform_id: company.platform_id,
                company_id: company.id,
                brand_id: brand?.id || null,
                name: `${template.name}${brand ? ` - ${brand.name}` : ""}`,
                description: template.description,
                images: images,
                category: template.category,
                is_active: true,
            });
        }
    }

    const inserted = await db.insert(schema.collections).values(collections).returning();
    seededData.collections = inserted;
    console.log(`✓ Created ${inserted.length} collections with ${inserted.length * 2} hero images`);
}

async function seedCollectionItems() {
    console.log("🔗 Linking collection items...");

    const collectionItems: Array<{
        collection: string;
        asset: string;
        default_quantity: number;
        notes: string | null;
        display_order: number;
    }> = [];

    for (const collection of seededData.collections) {
        const companyAssets = seededData.assets.filter(
            (a) => a.company_id === collection.company_id
        );

        // Pick 4-8 random assets for this collection
        const itemCount = Math.floor(Math.random() * 5) + 4;
        const selectedAssets = companyAssets
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.min(itemCount, companyAssets.length));

        selectedAssets.forEach((asset, idx) => {
            collectionItems.push({
                collection: collection.id,
                asset: asset.id,
                default_quantity:
                    asset.tracking_method === "BATCH" ? Math.floor(Math.random() * 10) + 5 : 1,
                notes: idx === 0 ? "Featured item in collection" : null,
                display_order: idx,
            });
        });
    }

    const inserted = await db.insert(schema.collectionItems).values(collectionItems).returning();
    seededData.collectionItems = inserted;
    console.log(`✓ Created ${inserted.length} collection items`);
}

async function seedOrders() {
    console.log("🛒 Seeding orders (various states)...");

    const orders = [];
    const platform1 = seededData.platforms[0];
    const clientUsers = seededData.users.filter((u) => u.role === "CLIENT");

    // Order statuses to create
    const orderStatuses: Array<{ status: any, financial: any, daysAgo: number, hasReskin?: boolean }> = [
        { status: 'DRAFT', financial: 'PENDING_QUOTE', daysAgo: 1 },
        { status: 'DRAFT', financial: 'PENDING_QUOTE', daysAgo: 2 },
        { status: 'SUBMITTED', financial: 'PENDING_QUOTE', daysAgo: 3 },
        { status: 'SUBMITTED', financial: 'PENDING_QUOTE', daysAgo: 4 },
        { status: 'PRICING_REVIEW', financial: 'PENDING_QUOTE', daysAgo: 5 },
        { status: 'PRICING_REVIEW', financial: 'PENDING_QUOTE', daysAgo: 6 },
        { status: 'PRICING_REVIEW', financial: 'PENDING_QUOTE', daysAgo: 7 },
        { status: 'PENDING_APPROVAL', financial: 'PENDING_QUOTE', daysAgo: 8 },
        { status: 'PENDING_APPROVAL', financial: 'PENDING_QUOTE', daysAgo: 9 },
        { status: 'QUOTED', financial: 'QUOTE_SENT', daysAgo: 10 },
        { status: 'QUOTED', financial: 'QUOTE_SENT', daysAgo: 11 },
        { status: 'QUOTED', financial: 'QUOTE_SENT', daysAgo: 12 },
        { status: 'CONFIRMED', financial: 'QUOTE_ACCEPTED', daysAgo: 15, hasReskin: true }, // Has reskin request
        { status: 'CONFIRMED', financial: 'QUOTE_ACCEPTED', daysAgo: 16 },
        { status: 'AWAITING_FABRICATION', financial: 'QUOTE_ACCEPTED', daysAgo: 17, hasReskin: true }, // Reskin in progress
        { status: 'AWAITING_FABRICATION', financial: 'QUOTE_ACCEPTED', daysAgo: 17.5, hasReskin: true }, // Reskin in progress
        { status: 'IN_PREPARATION', financial: 'QUOTE_ACCEPTED', daysAgo: 18 },
        { status: 'IN_PREPARATION', financial: 'QUOTE_ACCEPTED', daysAgo: 19 },
        { status: 'READY_FOR_DELIVERY', financial: 'INVOICED', daysAgo: 20 },
        { status: 'IN_TRANSIT', financial: 'INVOICED', daysAgo: 22 },
        { status: 'DELIVERED', financial: 'INVOICED', daysAgo: 25 },
        { status: 'DELIVERED', financial: 'PAID', daysAgo: 28 },
        { status: 'AWAITING_RETURN', financial: 'PAID', daysAgo: 30 },
        { status: 'AWAITING_RETURN', financial: 'PAID', daysAgo: 32 },
        { status: 'CLOSED', financial: 'PAID', daysAgo: 35 },
        { status: 'CLOSED', financial: 'PAID', daysAgo: 40 },
        { status: 'CANCELLED', financial: 'CANCELLED', daysAgo: 14 },
    ];

    for (let i = 0; i < orderStatuses.length; i++) {
        const { status, financial, daysAgo, hasReskin } = orderStatuses[i];
        const user = randomItem(clientUsers);
        const company = seededData.companies.find((c) => c.id === user.company_id);
        if (!company) continue;

        const companyBrands = seededData.brands.filter((b) => b.company_id === company.id);
        const brand =
            companyBrands.length > 0 && Math.random() > 0.3 ? randomItem(companyBrands) : null;

        const createdDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        const eventStart = new Date(Date.now() + (Math.random() * 60 + 10) * 24 * 60 * 60 * 1000); // 10-70 days from now
        const eventEnd = new Date(eventStart.getTime() + (Math.random() * 5 + 1) * 24 * 60 * 60 * 1000); // 1-6 days duration

        // Calculate volume/weight
        const volume = (Math.random() * 50 + 10).toFixed(3); // 10-60 m³
        const weight = (parseFloat(volume) * (Math.random() * 50 + 100)).toFixed(2); // 100-150 kg/m³

        // Determine vehicle type based on volume
        const vehicleType = parseFloat(volume) > 30 ? '10_TON' : parseFloat(volume) > 15 ? '7_TON' : 'STANDARD';
        const tripType = 'ROUND_TRIP';
        const emirate = randomItem(['Dubai', 'Abu Dhabi', 'Sharjah']);

        // Get pricing config rate (150 AED/m³ default)
        const warehouseOpsRate = 150.00;

        // Calculate base operations
        const baseOpsTotal = parseFloat(volume) * warehouseOpsRate;

        // Get transport rate (simulate lookup)
        const transportRate = vehicleType === '10_TON' ? 2160 : vehicleType === '7_TON' ? 1440 : 900; // ROUND_TRIP rates

        // For orders with pricing, calculate line items totals
        let catalogTotal = 0;
        let customTotal = 0;

        if (hasReskin && !['DRAFT', 'SUBMITTED', 'PRICING_REVIEW'].includes(status)) {
            // Reskin costs (custom, no margin)
            customTotal = Math.random() * 2000 + 1000; // 1000-3000 AED for reskins
            // Assembly/handling costs (catalog, with margin)
            catalogTotal = Math.random() * 500 + 200; // 200-700 AED
        } else if (!['DRAFT', 'SUBMITTED', 'PRICING_REVIEW'].includes(status)) {
            // Normal orders - just catalog items
            catalogTotal = Math.random() * 500 + 100; // 100-600 AED
        }

        // Calculate logistics subtotal (base ops + transport + catalog items)
        const logisticsSubtotal = baseOpsTotal + transportRate + catalogTotal;

        // Calculate margin (on logistics subtotal only, NOT on custom items)
        const marginPercent = parseFloat(company.platform_margin_percent);
        const marginAmount = logisticsSubtotal * (marginPercent / 100);

        // Calculate final total
        const finalTotal = logisticsSubtotal + marginAmount + customTotal;

        // Build NEW pricing structure (only for orders past SUBMITTED)
        const newPricing = !['DRAFT', 'SUBMITTED'].includes(status) ? {
            base_operations: {
                volume: parseFloat(volume),
                rate: warehouseOpsRate,
                total: parseFloat(baseOpsTotal.toFixed(2)),
            },
            transport: {
                trip_type: tripType,
                vehicle_type: vehicleType,
                rate: transportRate,
                total: transportRate,
                emirate: emirate,
                area: null,
                vehicle_changed: false,
                original_vehicle_type: null,
                vehicle_change_reason: null,
            },
            line_items: {
                catalog_total: parseFloat(catalogTotal.toFixed(2)),
                custom_total: parseFloat(customTotal.toFixed(2)),
            },
            logistics_subtotal: parseFloat(logisticsSubtotal.toFixed(2)),
            margin: {
                percent: marginPercent,
                amount: parseFloat(marginAmount.toFixed(2)),
                is_override: false,
                override_reason: null,
            },
            final_total: parseFloat(finalTotal.toFixed(2)),
            calculated_at: new Date(createdDate.getTime() + 36 * 60 * 60 * 1000).toISOString(),
            calculated_by: seededData.users.find(u => u.role === 'ADMIN')?.id || null,
        } : null;

        orders.push({
            platform_id: platform1.id,
            order_id: generateOrderId(createdDate, i + 1),
            company_id: company.id,
            brand_id: brand?.id || null,
            user_id: user.id,
            job_number: [
                "CONFIRMED",
                "IN_PREPARATION",
                "READY_FOR_DELIVERY",
                "IN_TRANSIT",
                "DELIVERED",
                "AWAITING_RETURN",
                "CLOSED",
            ].includes(status)
                ? `JOB-${createdDate.getFullYear()}-${String(i + 1).padStart(4, "0")}`
                : null,
            contact_name: user.name,
            contact_email: user.email,
            contact_phone: "+971-50-" + String(Math.floor(Math.random() * 9000000) + 1000000),
            event_start_date: eventStart,
            event_end_date: eventEnd,
            venue_name: randomItem([
                "Dubai World Trade Centre",
                "Atlantis The Palm",
                "Burj Al Arab",
                "Emirates Palace",
                "Address Downtown",
                "JW Marriott Marquis",
            ]),
            venue_location: {
                country: "United Arab Emirates",
                city: randomItem(["Dubai", "Abu Dhabi", "Sharjah"]),
                address: `${Math.floor(Math.random() * 500) + 1} Event Street, Area ${Math.floor(Math.random() * 50) + 1}`,
                access_notes:
                    "Service entrance at rear of building. Contact security upon arrival.",
            },
            special_instructions:
                Math.random() > 0.5 ? "Please handle with care. Setup required by 6 PM." : null,
            delivery_window: [
                "CONFIRMED",
                "IN_PREPARATION",
                "READY_FOR_DELIVERY",
                "IN_TRANSIT",
                "DELIVERED",
                "AWAITING_RETURN",
                "CLOSED",
            ].includes(status)
                ? {
                    start: new Date(eventStart.getTime() - 24 * 60 * 60 * 1000),
                    end: new Date(eventStart.getTime() - 12 * 60 * 60 * 1000),
                }
                : null,
            pickup_window: ["AWAITING_RETURN", "CLOSED"].includes(status)
                ? {
                    start: new Date(eventEnd.getTime() + 12 * 60 * 60 * 1000),
                    end: new Date(eventEnd.getTime() + 36 * 60 * 60 * 1000),
                }
                : null,
            calculated_totals: {
                volume: volume,
                weight: weight,
            },
            transport_trip_type: tripType as any,
            transport_vehicle_type: vehicleType as any,
            tier_id: null, // DEPRECATED
            logistics_pricing: null, // DEPRECATED - using new pricing structure
            platform_pricing: null, // DEPRECATED - using new pricing structure
            final_pricing: null, // DEPRECATED - using new pricing structure
            pricing: newPricing, // NEW hybrid pricing structure
            order_status: status,
            financial_status: financial,
            scanning_data: {},
            delivery_photos: ["IN_TRANSIT", "DELIVERED", "AWAITING_RETURN", "CLOSED"].includes(
                status
            )
                ? [
                    `https://placehold.co/800x600/475569/FFFFFF?text=${encodeURIComponent("Delivery Truck\\nLoading")}`,
                    `https://placehold.co/800x600/64748b/FFFFFF?text=${encodeURIComponent("Items in Transit")}`,
                ]
                : [],
        });
    }

    const inserted = await db.insert(schema.orders).values(orders).returning();
    seededData.orders = inserted;

    // Track which orders should have reskin requests
    for (let i = 0; i < orderStatuses.length; i++) {
        if (orderStatuses[i].hasReskin) {
            seededData.ordersWithReskin.push(inserted[i].id);
        }
    }

    console.log(`✓ Created ${inserted.length} orders across all statuses (${seededData.ordersWithReskin.length} with reskin requests)`);
}

async function seedOrderItems() {
    console.log("📦 Seeding order items...");

    const orderItems = [];

    for (const order of seededData.orders) {
        const companyAssets = seededData.assets.filter(a => a.company_id === order.company_id && a.status === 'AVAILABLE');
        const companyBrands = seededData.brands.filter(b => b.company_id === order.company_id);
        const hasReskin = seededData.ordersWithReskin.includes(order.id);

        // 5-8 items per order
        const itemCount = Math.floor(Math.random() * 4) + 5;
        const selectedAssets = companyAssets
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.min(itemCount, companyAssets.length));

        for (let idx = 0; idx < selectedAssets.length; idx++) {
            const asset = selectedAssets[idx];
            const quantity = asset.tracking_method === 'BATCH' ? Math.floor(Math.random() * 10) + 1 : 1;
            const volumePerUnit = parseFloat(asset.volume_per_unit);
            const weightPerUnit = parseFloat(asset.weight_per_unit);

            // For reskin orders, mark 2 items as reskin requests
            const isReskinItem = hasReskin && idx < 2;
            const targetBrand = isReskinItem && companyBrands.length > 0 ? randomItem(companyBrands) : null;
            const useCustomBrand = isReskinItem && Math.random() > 0.7; // 30% custom brand

            orderItems.push({
                platform_id: order.platform_id,
                order_id: order.id,
                asset_id: asset.id,
                asset_name: asset.name,
                quantity: quantity,
                volume_per_unit: asset.volume_per_unit,
                weight_per_unit: asset.weight_per_unit,
                total_volume: (volumePerUnit * quantity).toFixed(3),
                total_weight: (weightPerUnit * quantity).toFixed(2),
                condition_notes: null,
                handling_tags: asset.handling_tags,
                from_collection: null,
                from_collection_name: null,
                is_reskin_request: isReskinItem,
                reskin_target_brand_id: isReskinItem && !useCustomBrand ? targetBrand?.id || null : null,
                reskin_target_brand_custom: isReskinItem && useCustomBrand ? 'Custom Brand X' : null,
                reskin_notes: isReskinItem ? 'Please apply new branding as per attached mockup' : null,
            });
        }
    }

    const inserted = await db.insert(schema.orderItems).values(orderItems).returning();
    seededData.orderItems = inserted;
    console.log(`✓ Created ${inserted.length} order items (${inserted.filter(i => i.is_reskin_request).length} reskin requests)`);
}

async function seedReskinRequests() {
    console.log('🎨 Seeding reskin requests...');

    const reskinRequests = [];
    const adminUsers = seededData.users.filter(u => u.role === 'ADMIN');

    // Get all order items that are reskin requests
    const reskinOrderItems = seededData.orderItems.filter(i => i.is_reskin_request);

    for (const item of reskinOrderItems) {
        const order = seededData.orders.find(o => o.id === item.order_id);
        if (!order) continue;

        const originalAsset = seededData.assets.find(a => a.id === item.asset_id);
        if (!originalAsset) continue;

        const createdDate = new Date(order.created_at.getTime() + 12 * 60 * 60 * 1000); // 12 hours after order

        // Determine if completed (for AWAITING_FABRICATION with later date)
        const isCompleted = order.order_status !== 'AWAITING_FABRICATION';

        reskinRequests.push({
            platform_id: order.platform_id,
            order_id: order.id,
            order_item_id: item.id,
            original_asset_id: item.asset_id,
            original_asset_name: item.asset_name,
            original_brand_id: originalAsset.brand_id,
            target_brand_id: item.reskin_target_brand_id,
            target_brand_custom: item.reskin_target_brand_custom,
            client_notes: item.reskin_notes || 'Please apply new branding as per mockup. Timeline is critical for event.',
            admin_notes: isCompleted ? 'Fabrication completed successfully. New asset ready for delivery.' : 'In fabrication queue. Estimated 7 days completion.',
            new_asset_id: isCompleted ? originalAsset.id : null, // In real scenario, would be a new asset ID
            new_asset_name: isCompleted ? item.asset_name : null,
            completed_at: isCompleted ? new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
            completed_by: isCompleted ? randomItem(adminUsers).id : null,
            completion_notes: isCompleted ? 'Quality checked and approved for delivery' : null,
            completion_photos: isCompleted ? [
                `https://placehold.co/800x600/10b981/FFFFFF?text=${encodeURIComponent('Completed\\n' + item.asset_name)}`,
            ] : [],
            cancelled_at: null,
            cancelled_by: null,
            cancellation_reason: null,
        });
    }

    const inserted = await db.insert(schema.reskinRequests).values(reskinRequests).returning();
    seededData.reskinRequests = inserted;
    console.log(`✓ Created ${inserted.length} reskin requests`);
}

async function seedOrderLineItems() {
    console.log('💰 Seeding order line items (reskin costs, assembly, etc.)...');

    const lineItems = [];
    const adminUsers = seededData.users.filter(u => u.role === 'ADMIN');
    const logisticsUsers = seededData.users.filter(u => u.role === 'LOGISTICS');

    for (const order of seededData.orders) {
        // Only add line items for orders past PRICING_REVIEW
        if (!['PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'AWAITING_FABRICATION', 'IN_PREPARATION', 'READY_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'AWAITING_RETURN', 'CLOSED'].includes(order.order_status)) {
            continue;
        }

        // Get pricing totals from order
        const pricing = order.pricing as any;
        if (!pricing) continue;

        const catalogTarget = pricing.line_items.catalog_total;
        const customTarget = pricing.line_items.custom_total;

        const addedDate = new Date(order.created_at.getTime() + 36 * 60 * 60 * 1000);

        // Add reskin line items for reskin requests (CUSTOM - no margin)
        const orderReskinRequests = seededData.reskinRequests.filter(r => r.order_id === order.id);
        if (orderReskinRequests.length > 0 && customTarget > 0) {
            // Distribute custom_total across reskin requests
            const costPerReskin = customTarget / orderReskinRequests.length;

            for (const reskinReq of orderReskinRequests) {
                lineItems.push({
                    platform_id: order.platform_id,
                    order_id: order.id,
                    service_type_id: null,
                    reskin_request_id: reskinReq.id,
                    line_item_type: 'CUSTOM' as const,
                    category: 'RESKIN' as const,
                    description: `Rebrand: ${reskinReq.original_asset_name}`,
                    quantity: null,
                    unit: null,
                    unit_rate: null,
                    total: costPerReskin.toFixed(2),
                    added_by: randomItem(adminUsers).id,
                    added_at: addedDate,
                    notes: 'Custom fabrication and branding application',
                    is_voided: false,
                    voided_at: null,
                    voided_by: null,
                    void_reason: null,
                });
            }
        }

        // Add catalog service items (assembly, handling, etc.) - margin applied
        if (catalogTarget > 0) {
            const numServices = Math.floor(Math.random() * 2) + 1;
            const availableServices = seededData.serviceTypes.filter(s => s.default_rate);

            if (availableServices.length > 0) {
                // Distribute catalog_total across services
                const costPerService = catalogTarget / numServices;

                for (let i = 0; i < numServices; i++) {
                    const service = randomItem(availableServices);
                    const rate = parseFloat(service.default_rate);
                    const qty = Math.max(1, Math.floor(costPerService / rate));
                    const total = (qty * rate).toFixed(2);

                    lineItems.push({
                        platform_id: order.platform_id,
                        order_id: order.id,
                        service_type_id: service.id,
                        reskin_request_id: null,
                        line_item_type: 'CATALOG' as const,
                        category: service.category,
                        description: service.name,
                        quantity: qty.toString(),
                        unit: service.unit,
                        unit_rate: service.default_rate,
                        total: total,
                        added_by: randomItem(logisticsUsers).id,
                        added_at: addedDate,
                        notes: null,
                        is_voided: false,
                        voided_at: null,
                        voided_by: null,
                        void_reason: null,
                    });
                }
            }
        }
    }

    const inserted = await db.insert(schema.orderLineItems).values(lineItems).returning();
    seededData.orderLineItems = inserted;
    console.log(`✓ Created ${inserted.length} order line items (${inserted.filter(i => i.category === 'RESKIN').length} reskin costs)`);
}

async function seedAssetBookings() {
    console.log("📅 Seeding asset bookings (date conflicts)...");

    const bookings = [];

    // Create bookings for BOOKED and OUT assets
    for (const order of seededData.orders) {
        if (
            ![
                "CONFIRMED",
                "IN_PREPARATION",
                "READY_FOR_DELIVERY",
                "IN_TRANSIT",
                "DELIVERED",
                "AWAITING_RETURN",
            ].includes(order.order_status)
        ) {
            continue;
        }

        const orderItemsForOrder = seededData.orderItems.filter((oi) => oi.order_id === order.id);

        for (const item of orderItemsForOrder) {
            bookings.push({
                asset_id: item.asset_id,
                order_id: order.id,
                quantity: item.quantity,
                blocked_from: order.event_start_date,
                blocked_until: order.event_end_date,
            });
        }
    }

    const inserted = await db.insert(schema.assetBookings).values(bookings).returning();
    console.log(`✓ Created ${inserted.length} asset bookings`);
}

async function seedScanEvents() {
    console.log("📱 Seeding scan events (outbound/inbound)...");

    const scanEvents = [];
    const logisticsUsers = seededData.users.filter((u) => u.role === "LOGISTICS");

    for (const order of seededData.orders) {
        const orderItemsForOrder = seededData.orderItems.filter((oi) => oi.order_id === order.id);

        // Outbound scans (for orders that have been delivered)
        if (
            ["READY_FOR_DELIVERY", "IN_TRANSIT", "DELIVERED", "AWAITING_RETURN", "CLOSED"].includes(
                order.order_status
            )
        ) {
            for (const item of orderItemsForOrder) {
                const asset = seededData.assets.find((a) => a.id === item.asset_id);
                if (!asset) continue;

                scanEvents.push({
                    order_id: order.id,
                    asset_id: asset.id,
                    scan_type: "OUTBOUND" as ScanType,
                    quantity: item.quantity,
                    condition: "GREEN" as AssetCondition,
                    notes: "All items verified before loading",
                    photos: [],
                    discrepancy_reason: null,
                    scanned_by: randomItem(logisticsUsers).id,
                    scanned_at: new Date(order.event_start_date.getTime() - 24 * 60 * 60 * 1000),
                });
            }
        }

        // Inbound scans (for closed orders)
        if (["CLOSED"].includes(order.order_status)) {
            for (const item of orderItemsForOrder) {
                const asset = seededData.assets.find((a) => a.id === item.asset_id);
                if (!asset) continue;

                // 90% come back in good condition
                const returnCondition =
                    Math.random() < 0.9 ? "GREEN" : Math.random() < 0.5 ? "ORANGE" : "RED";
                const hasIssue = returnCondition !== "GREEN";

                scanEvents.push({
                    order_id: order.id,
                    asset_id: asset.id,
                    scan_type: "INBOUND" as ScanType,
                    quantity: item.quantity,
                    condition: returnCondition as AssetCondition,
                    notes: hasIssue
                        ? returnCondition === "ORANGE"
                            ? "Minor wear and tear"
                            : "Significant damage, needs repair"
                        : "Returned in excellent condition",
                    photos:
                        returnCondition === "RED"
                            ? [
                                `https://placehold.co/800x600/dc2626/FFFFFF?text=${encodeURIComponent("Damage Report\\nPhoto 1")}`,
                                `https://placehold.co/800x600/b91c1c/FFFFFF?text=${encodeURIComponent("Damage Report\\nPhoto 2")}`,
                            ]
                            : [],
                    discrepancy_reason: null,
                    scanned_by: randomItem(logisticsUsers).id,
                    scanned_at: new Date(order.event_end_date.getTime() + 36 * 60 * 60 * 1000),
                });
            }
        }
    }

    const inserted = await db.insert(schema.scanEvents).values(scanEvents).returning();
    console.log(`✓ Created ${inserted.length} scan events (with damage photos)`);
}

async function seedOrderStatusHistory() {
    console.log("📜 Seeding order status history...");

    const history: Array<{
        platform_id: string;
        order_id: string;
        status: OrderStatus;
        notes: string;
        updated_by: string;
        timestamp: Date;
    }> = [];
    const adminUsers = seededData.users.filter((u) => u.role === "ADMIN");
    const logisticsUsers = seededData.users.filter((u) => u.role === "LOGISTICS");

    for (const order of seededData.orders) {
        const statusProgression = getStatusProgression(order.order_status);

        statusProgression.forEach((status, idx) => {
            const daysOffset = idx * 2; // Status changes every 2 days
            const timestamp = new Date(
                order.created_at.getTime() + daysOffset * 24 * 60 * 60 * 1000
            );
            const updatedBy = ["PRICING_REVIEW", "IN_PREPARATION", "READY_FOR_DELIVERY"].includes(
                status
            )
                ? randomItem(logisticsUsers)
                : randomItem(adminUsers);

            history.push({
                platform_id: order.platform_id,
                order_id: order.id,
                status: status as OrderStatus,
                notes: getStatusNote(status),
                updated_by: updatedBy.id,
                timestamp: timestamp,
            });
        });
    }

    const inserted = await db.insert(schema.orderStatusHistory).values(history).returning();
    console.log(`✓ Created ${inserted.length} status history entries`);
}

async function seedFinancialStatusHistory() {
    console.log("💳 Seeding financial status history...");

    const history: Array<{
        platform_id: string;
        order_id: string;
        status: FinancialStatus;
        notes: string;
        updated_by: string;
        timestamp: Date;
    }> = [];
    const adminUsers = seededData.users.filter((u) => u.role === "ADMIN");

    for (const order of seededData.orders) {
        const financialProgression = getFinancialProgression(order.financial_status);

        financialProgression.forEach((status, idx) => {
            const daysOffset = idx * 2;
            const timestamp = new Date(
                order.created_at.getTime() + daysOffset * 24 * 60 * 60 * 1000
            );

            history.push({
                platform_id: order.platform_id,
                order_id: order.id,
                status: status as FinancialStatus,
                notes: getFinancialNote(status),
                updated_by: randomItem(adminUsers).id,
                timestamp: timestamp,
            });
        });
    }

    const inserted = await db.insert(schema.financialStatusHistory).values(history).returning();
    console.log(`✓ Created ${inserted.length} financial history entries`);
}

async function seedInvoices() {
    console.log("🧾 Seeding invoices (with PDF URLs)...");

    const invoices = [];
    const adminUsers = seededData.users.filter((u) => u.role === "ADMIN");
    let invoiceSeq = 1;

    for (const order of seededData.orders) {
        if (!["INVOICED", "PAID"].includes(order.financial_status)) continue;

        const invoiceDate = new Date(order.created_at.getTime() + 15 * 24 * 60 * 60 * 1000);
        const invoiceId = generateInvoiceId(invoiceDate, invoiceSeq++);

        // Simulate S3 PDF URL
        const pdfUrl = `https://${process.env.AWS_BUCKET_NAME || "kadence-storage"}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${order.platform_id}/invoices/${order.id}/${invoiceId}.pdf`;

        invoices.push({
            platform_id: order.platform_id,
            order_id: order.id,
            invoice_id: invoiceId,
            invoice_pdf_url: pdfUrl,
            invoice_paid_at:
                order.financial_status === "PAID"
                    ? new Date(invoiceDate.getTime() + 7 * 24 * 60 * 60 * 1000)
                    : null,
            payment_method:
                order.financial_status === "PAID"
                    ? randomItem(["Bank Transfer", "Credit Card", "Check"])
                    : null,
            payment_reference:
                order.financial_status === "PAID"
                    ? `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
                    : null,
            generated_by: randomItem(adminUsers).id,
            updated_by: null,
        });
    }

    const inserted = await db.insert(schema.invoices).values(invoices).returning();
    console.log(`✓ Created ${inserted.length} invoices with PDF URLs`);
}

async function seedAssetConditionHistory() {
    console.log("🔧 Seeding asset condition history (with damage photos)...");

    const history = [];
    const logisticsUsers = seededData.users.filter((u) => u.role === "LOGISTICS");

    // Add history for assets with non-GREEN conditions
    for (const asset of seededData.assets) {
        if (asset.condition === "GREEN") continue;

        const historyEntries = Math.floor(Math.random() * 3) + 1; // 1-3 history entries

        for (let i = 0; i < historyEntries; i++) {
            const daysAgo = (historyEntries - i) * 7; // Spaced weekly
            const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

            const entryCondition =
                i === 0
                    ? asset.condition
                    : i === historyEntries - 1
                        ? "GREEN"
                        : randomItem(["GREEN", "ORANGE"]);

            history.push({
                platform_id: asset.platform_id,
                asset_id: asset.id,
                condition: entryCondition,
                notes:
                    entryCondition === "RED"
                        ? "Item damaged, sent to maintenance"
                        : entryCondition === "ORANGE"
                            ? "Minor repairs completed"
                            : "Restored to working condition",
                photos:
                    entryCondition === "RED"
                        ? [
                            `https://placehold.co/800x600/dc2626/FFFFFF?text=${encodeURIComponent("Asset Damage\\nPhoto")}`,
                            `https://placehold.co/800x600/b91c1c/FFFFFF?text=${encodeURIComponent("Close-up\\nDamage")}`,
                        ]
                        : [],
                updated_by: randomItem(logisticsUsers).id,
                timestamp: timestamp,
            });
        }
    }

    const inserted = await db.insert(schema.assetConditionHistory).values(history).returning();
    console.log(`✓ Created ${inserted.length} condition history entries (with damage photos)`);
}

async function seedNotificationLogs() {
    console.log("📧 Seeding notification logs...");

    const notifications = [];

    for (const order of seededData.orders) {
        const notificationTypes = getNotificationTypesForStatus(
            order.order_status,
            order.financial_status
        );
        const user = seededData.users.find((u) => u.id === order.user_id);

        for (const notifType of notificationTypes) {
            const status = Math.random() < 0.9 ? "SENT" : Math.random() < 0.5 ? "FAILED" : "QUEUED";
            const attempts = status === "FAILED" ? Math.floor(Math.random() * 3) + 1 : 1;

            notifications.push({
                platform_id: order.platform_id,
                order_id: order.id,
                notification_type: notifType,
                recipients: JSON.stringify({
                    to: [user?.email || "client@test.com"],
                    cc: ["admin@test.com"],
                }),
                status: status as NotificationStatus,
                attempts: attempts,
                last_attempt_at: new Date(order.updated_at.getTime() + 60 * 60 * 1000),
                sent_at:
                    status === "SENT"
                        ? new Date(order.updated_at.getTime() + 60 * 60 * 1000)
                        : null,
                message_id:
                    status === "SENT"
                        ? `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                        : null,
                error_message: status === "FAILED" ? "SMTP connection timeout" : null,
            });
        }
    }

    const inserted = await db.insert(schema.notificationLogs).values(notifications).returning();
    console.log(`✓ Created ${inserted.length} notification logs`);
}

// ============================================================
// HELPER FUNCTIONS FOR ORDER PROGRESSION
// ============================================================

function getStatusProgression(finalStatus: string): string[] {
    const progressions: Record<string, string[]> = {
        'DRAFT': ['DRAFT'],
        'SUBMITTED': ['DRAFT', 'SUBMITTED'],
        'PRICING_REVIEW': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW'],
        'PENDING_APPROVAL': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL'],
        'QUOTED': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED'],
        'DECLINED': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'DECLINED'],
        'CONFIRMED': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED'],
        'AWAITING_FABRICATION': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'AWAITING_FABRICATION'],
        'IN_PREPARATION': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'IN_PREPARATION'],
        'READY_FOR_DELIVERY': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_DELIVERY'],
        'IN_TRANSIT': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_DELIVERY', 'IN_TRANSIT'],
        'DELIVERED': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED'],
        'AWAITING_RETURN': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'AWAITING_RETURN'],
        'RETURN_IN_TRANSIT': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'AWAITING_RETURN', 'RETURN_IN_TRANSIT'],
        'CLOSED': ['DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'AWAITING_RETURN', 'RETURN_IN_TRANSIT', 'CLOSED'],
        'CANCELLED': ['DRAFT', 'SUBMITTED', 'CANCELLED'],
    };

    return progressions[finalStatus] || ["DRAFT"];
}

function getFinancialProgression(finalStatus: string): string[] {
    const progressions: Record<string, string[]> = {
        'PENDING_QUOTE': ['PENDING_QUOTE'],
        'QUOTE_SENT': ['PENDING_QUOTE', 'QUOTE_SENT'],
        'QUOTE_REVISED': ['PENDING_QUOTE', 'QUOTE_SENT', 'QUOTE_REVISED'],
        'QUOTE_ACCEPTED': ['PENDING_QUOTE', 'QUOTE_SENT', 'QUOTE_ACCEPTED'],
        'PENDING_INVOICE': ['PENDING_QUOTE', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'PENDING_INVOICE'],
        'INVOICED': ['PENDING_QUOTE', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'PENDING_INVOICE', 'INVOICED'],
        'PAID': ['PENDING_QUOTE', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'PENDING_INVOICE', 'INVOICED', 'PAID'],
        'CANCELLED': ['PENDING_QUOTE', 'CANCELLED'],
    };

    return progressions[finalStatus] || ["PENDING_QUOTE"];
}

function getStatusNote(status: string): string {
    const notes: Record<string, string> = {
        'DRAFT': 'Order created',
        'SUBMITTED': 'Order submitted by client',
        'PRICING_REVIEW': 'Under logistics review',
        'PENDING_APPROVAL': 'Awaiting admin approval',
        'QUOTED': 'Quote sent to client',
        'CONFIRMED': 'Client approved quote',
        'AWAITING_FABRICATION': 'Awaiting fabrication completion',
        'IN_PREPARATION': 'Items being prepared',
        'READY_FOR_DELIVERY': 'Ready for pickup',
        'IN_TRANSIT': 'En route to venue',
        'DELIVERED': 'Delivered to venue',
        'AWAITING_RETURN': 'Event complete, awaiting pickup',
        'RETURN_IN_TRANSIT': 'Items returning to warehouse',
        'CLOSED': 'Order complete',
        'CANCELLED': 'Order cancelled',
    };

    return notes[status] || "Status updated";
}

function getFinancialNote(status: string): string {
    const notes: Record<string, string> = {
        'PENDING_QUOTE': 'Awaiting pricing',
        'QUOTE_SENT': 'Quote delivered to client',
        'QUOTE_REVISED': 'Quote revised, awaiting acknowledgment',
        'QUOTE_ACCEPTED': 'Client accepted quote',
        'PENDING_INVOICE': 'Preparing invoice',
        'INVOICED': 'Invoice generated and sent',
        'PAID': 'Payment received',
        'CANCELLED': 'Order cancelled',
    };

    return notes[status] || "Financial status updated";
}

function getNotificationTypesForStatus(orderStatus: string, financialStatus: string): string[] {
    const types: string[] = [];

    if (orderStatus === "SUBMITTED") types.push("ORDER_SUBMITTED");
    if (orderStatus === "PENDING_APPROVAL") types.push("A2_ADJUSTED_PRICING");
    if (orderStatus === "QUOTED") types.push("QUOTE_SENT");
    if (orderStatus === "CONFIRMED") types.push("QUOTE_APPROVED");
    if (orderStatus === "READY_FOR_DELIVERY") types.push("READY_FOR_DELIVERY");
    if (orderStatus === "IN_TRANSIT") types.push("IN_TRANSIT");
    if (orderStatus === "DELIVERED") types.push("DELIVERED");
    if (orderStatus === "AWAITING_RETURN") types.push("PICKUP_REMINDER");
    if (orderStatus === "CLOSED") types.push("ORDER_CLOSED");
    if (financialStatus === "INVOICED") types.push("INVOICE_GENERATED");
    if (financialStatus === "PAID") types.push("PAYMENT_CONFIRMED");

    return types;
}

// ============================================================
// CLEANUP FUNCTION
// ============================================================

async function cleanupExistingData() {
    console.log("🧹 Cleaning up existing data...");

    try {
        // Fix old enum values first (if any exist)
        try {
            await db.execute(
                sql`UPDATE transport_rates SET trip_type = 'ONE_WAY' WHERE trip_type = 'ADDITIONAL'`
            );
        } catch (e) {
            // Ignore if column/table doesn't exist
        }

        // Delete in reverse dependency order
        await db.delete(schema.notificationLogs);
        await db.delete(schema.assetConditionHistory);
        await db.delete(schema.scanEvents);
        await db.delete(schema.financialStatusHistory);
        await db.delete(schema.orderStatusHistory);
        await db.delete(schema.invoices);
        await db.delete(schema.assetBookings);
        await db.delete(schema.orderLineItems);
        await db.delete(schema.reskinRequests);
        await db.delete(schema.orderItems);
        await db.delete(schema.orders);
        await db.delete(schema.collectionItems);
        await db.delete(schema.collections);
        await db.delete(schema.assets);
        await db.delete(schema.serviceTypes);
        await db.delete(schema.transportRates);
        await db.delete(schema.pricingConfig);
        await db.delete(schema.zones);
        await db.delete(schema.brands);
        await db.delete(schema.companyDomains);
        await db.delete(schema.users);
        await db.delete(schema.companies);
        await db.delete(schema.warehouses);
        await db.delete(schema.platforms);

        console.log("✓ Existing data cleaned up\n");
    } catch (error) {
        console.log("⚠️  Cleanup warning (tables may be empty):", (error as Error).message);
    }
}

console.log("");
console.log("========================================");
console.log("COMPREHENSIVE DATABASE SEED");
console.log("========================================");
console.log("");

async function main() {
    try {
        console.log("🚀 Starting comprehensive database seed...\n");

        // Phase 0: Cleanup
        await cleanupExistingData();

        // Phase 1: Core infrastructure
        await seedPlatforms();
        await seedCompanies();
        await seedCountries();
        await seedCompanyDomains();
        await seedWarehouses();
        await seedUsers();
        await seedBrands();
        await seedZones();

        // Phase 2: Pricing & configuration
        await seedPricingConfig();
        await seedTransportRates();
        await seedServiceTypes();

        // Phase 3: Assets & collections (with extensive images)
        await seedAssets();
        await seedCollections();
        await seedCollectionItems();

        // Phase 4: Orders & workflow
        await seedOrders();
        await seedOrderItems();
        await seedReskinRequests();
        await seedOrderLineItems();
        await seedAssetBookings();

        // Phase 5: Scanning & tracking (with damage photos)
        await seedScanEvents();
        await seedAssetConditionHistory();

        // Phase 6: Financial & notifications
        await seedOrderStatusHistory();
        await seedFinancialStatusHistory();
        await seedInvoices();
        await seedNotificationLogs();

        console.log("\n✅ COMPREHENSIVE SEED COMPLETE!");
        console.log("\n📊 Final Summary:");
        console.log(`  - Platforms: ${seededData.platforms.length}`);
        console.log(`  - Companies: ${seededData.companies.length}`);
        console.log(`  - Users: ${seededData.users.length}`);
        console.log(`  - Warehouses: ${seededData.warehouses.length}`);
        console.log(`  - Zones: ${seededData.zones.length}`);
        console.log(`  - Brands: ${seededData.brands.length}`);
        console.log(
            `  - Assets: ${seededData.assets.length} (${seededData.assets.length * 3} images)`
        );
        console.log(
            `  - Collections: ${seededData.collections.length} (${seededData.collections.length * 2} images)`
        );
        console.log(`  - Collection Items: ${seededData.collectionItems.length}`);
        console.log(`  - Pricing Configs: ${seededData.pricingConfigs.length}`);
        console.log(`  - Transport Rates: ${seededData.transportRates.length}`);
        console.log(`  - Service Types: ${seededData.serviceTypes.length}`);
        console.log(`  - Orders: ${seededData.orders.length} (${seededData.orders.filter(o => o.order_status === 'AWAITING_FABRICATION').length} awaiting fabrication)`);
        console.log(`  - Order Items: ${seededData.orderItems.length} (${seededData.orderItems.filter(i => i.is_reskin_request).length} reskin requests)`);
        console.log(`  - Reskin Requests: ${seededData.reskinRequests.length}`);
        console.log(`  - Order Line Items: ${seededData.orderLineItems.length} (${seededData.orderLineItems.filter(i => i.category === 'RESKIN').length} reskin costs)`);

        console.log('\n🖼️  Image Summary:');
        console.log(`  - Asset images: ${seededData.assets.length * 3}`);
        console.log(`  - Collection images: ${seededData.collections.length * 2}`);
        console.log(`  - Brand logos: ${seededData.brands.length}`);
        console.log(
            `  - Truck photos: ~${seededData.orders.filter((o) => o.delivery_photos.length > 0).length * 2}`
        );
        console.log(`  - Damage photos: Generated for RED condition items`);
        console.log(
            `  - Total placeholder images: ${seededData.assets.length * 3 + seededData.collections.length * 2 + seededData.brands.length + 50}+`
        );

        console.log("\n🔑 Test Credentials:");
        console.log("  Platform Admin: admin@test.com / password123");
        console.log("  Logistics: logistics@test.com / password123");
        console.log("  Diageo Client: client@diageo.com / password123");
        console.log("  Unilever Client: client@unilever.com / password123");
        console.log("  P&G Client: client@pg.com / password123\n");
    } catch (error) {
        console.error("\n❌ Seed failed:", error);
        console.error(error);
        throw error;
    }
}

main();
