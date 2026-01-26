/**
 * Hybrid Pricing System - Seed Data
 * Seeds pricing_config, transport_rates, and service_types tables
 */

import { db } from "../index";
import { pricingConfig, transportRates, serviceTypes, platforms } from "../schema";
import { eq } from "drizzle-orm";

export async function seedHybridPricing() {
    console.log("🌱 Seeding Hybrid Pricing System...");

    // Get all platforms
    const allPlatforms = await db.select().from(platforms);

    if (allPlatforms.length === 0) {
        console.log("⚠️  No platforms found. Please seed platforms first.");
        return;
    }

    for (const platform of allPlatforms) {
        console.log(`\n📦 Seeding pricing data for platform: ${platform.name}`);

        // ============================================================
        // 1. PRICING CONFIG (Platform Default)
        // ============================================================
        console.log("  → Creating platform default pricing config...");

        const existingConfig = await db
            .select()
            .from(pricingConfig)
            .where(eq(pricingConfig.platform_id, platform.id))
            .limit(1);

        if (existingConfig.length === 0) {
            await db.insert(pricingConfig).values({
                platform_id: platform.id,
                company_id: null, // Platform default
                warehouse_ops_rate: "25.20", // 6.00 (picking) + 9.60 (handling out) + 9.60 (handling in)
                is_active: true,
            });
            console.log("     ✓ Platform default config created (25.20 AED/m³)");
        } else {
            console.log("     ℹ️  Platform default config already exists");
        }

        // ============================================================
        // 2. TRANSPORT RATES
        // ============================================================
        console.log("  → Creating transport rates...");

        const transportData = [
            { emirate: "Dubai", trip_type: "ONE_WAY", vehicle_type: "STANDARD", rate: "300.00" },
            { emirate: "Dubai", trip_type: "ROUND_TRIP", vehicle_type: "STANDARD", rate: "500.00" },
            { emirate: "Abu Dhabi", trip_type: "ONE_WAY", vehicle_type: "STANDARD", rate: "495.00" },
            { emirate: "Abu Dhabi", trip_type: "ROUND_TRIP", vehicle_type: "STANDARD", rate: "990.00" },
            { emirate: "Al Ain", trip_type: "ONE_WAY", vehicle_type: "STANDARD", rate: "550.00" },
            { emirate: "Al Ain", trip_type: "ROUND_TRIP", vehicle_type: "STANDARD", rate: "1100.00" },
            { emirate: "Sharjah", trip_type: "ONE_WAY", vehicle_type: "STANDARD", rate: "400.00" },
            { emirate: "Sharjah", trip_type: "ROUND_TRIP", vehicle_type: "STANDARD", rate: "600.00" },
            { emirate: "Ajman", trip_type: "ONE_WAY", vehicle_type: "STANDARD", rate: "400.00" },
            { emirate: "Ajman", trip_type: "ROUND_TRIP", vehicle_type: "STANDARD", rate: "750.00" },
            {
                emirate: "Ras Al Khaimah",
                trip_type: "ONE_WAY",
                vehicle_type: "STANDARD",
                rate: "550.00",
            },
            {
                emirate: "Ras Al Khaimah",
                trip_type: "ROUND_TRIP",
                vehicle_type: "STANDARD",
                rate: "1100.00",
            },
            {
                emirate: "Umm Al Quwain",
                trip_type: "ONE_WAY",
                vehicle_type: "STANDARD",
                rate: "550.00",
            },
            {
                emirate: "Umm Al Quwain",
                trip_type: "ROUND_TRIP",
                vehicle_type: "STANDARD",
                rate: "1100.00",
            },
            { emirate: "Fujairah", trip_type: "ONE_WAY", vehicle_type: "STANDARD", rate: "600.00" },
            { emirate: "Fujairah", trip_type: "ROUND_TRIP", vehicle_type: "STANDARD", rate: "1100.00" },
        ];

        const existingTransport = await db
            .select()
            .from(transportRates)
            .where(eq(transportRates.platform_id, platform.id))
            .limit(1);

        let transportCreated = 0;
        if (existingTransport.length === 0) {
            for (const rate of transportData) {
                await db.insert(transportRates).values({
                    platform_id: platform.id,
                    company_id: null, // Platform default
                    emirate: rate.emirate,
                    area: null,
                    trip_type: rate.trip_type as any,
                    vehicle_type: rate.vehicle_type as any,
                    rate: rate.rate,
                    is_active: true,
                });
                transportCreated++;
            }
        }
        console.log(`     ✓ ${transportCreated} transport rates created`);

        // ============================================================
        // 3. SERVICE TYPES CATALOG
        // ============================================================
        console.log("  → Creating service types catalog...");

        const serviceTypeData = [
            {
                name: "Assembly (Regular Hours)",
                category: "ASSEMBLY",
                unit: "hour",
                default_rate: "18.00",
                description: "Assembly labor during regular business hours",
                display_order: 1,
            },
            {
                name: "Assembly (Holiday Hours)",
                category: "ASSEMBLY",
                unit: "hour",
                default_rate: "25.00",
                description: "Assembly labor during holidays and weekends",
                display_order: 2,
            },
            {
                name: "Forklift 3-ton (Hourly)",
                category: "EQUIPMENT",
                unit: "hour",
                default_rate: "140.00",
                description: "Forklift rental - 3 ton capacity",
                display_order: 3,
            },
            {
                name: "Forklift 5-ton (Hourly)",
                category: "EQUIPMENT",
                unit: "hour",
                default_rate: "200.00",
                description: "Forklift rental - 5 ton capacity",
                display_order: 4,
            },
            {
                name: "Forklift 10-ton (Hourly)",
                category: "EQUIPMENT",
                unit: "hour",
                default_rate: "260.00",
                description: "Forklift rental - 10 ton capacity",
                display_order: 5,
            },
            {
                name: "Forklift 3-ton Mobilisation",
                category: "EQUIPMENT",
                unit: "trip",
                default_rate: "960.00",
                description: "One-time mobilisation fee for 3-ton forklift",
                display_order: 6,
            },
            {
                name: "Forklift 5-ton Mobilisation",
                category: "EQUIPMENT",
                unit: "trip",
                default_rate: "1080.00",
                description: "One-time mobilisation fee for 5-ton forklift",
                display_order: 7,
            },
            {
                name: "Forklift 10-ton Mobilisation",
                category: "EQUIPMENT",
                unit: "trip",
                default_rate: "1440.00",
                description: "One-time mobilisation fee for 10-ton forklift",
                display_order: 8,
            },
            {
                name: "Special Handling",
                category: "HANDLING",
                unit: "unit",
                default_rate: null,
                description: "Special handling for non-standard items",
                display_order: 9,
            },
        ];

        const existingServices = await db
            .select()
            .from(serviceTypes)
            .where(eq(serviceTypes.platform_id, platform.id))
            .limit(1);

        let servicesCreated = 0;
        if (existingServices.length === 0) {
            for (const service of serviceTypeData) {
                await db.insert(serviceTypes).values({
                    platform_id: platform.id,
                    name: service.name,
                    category: service.category as any,
                    unit: service.unit,
                    default_rate: service.default_rate,
                    description: service.description,
                    display_order: service.display_order,
                    is_active: true,
                });
                servicesCreated++;
            }
        }
        console.log(`     ✓ ${servicesCreated} service types created`);
    }

    console.log("\n✅ Hybrid Pricing System seed complete!");
}

// Run seed if executed directly
if (require.main === module) {
    seedHybridPricing()
        .then(() => {
            console.log("Seed completed successfully");
            process.exit(0);
        })
        .catch((error) => {
            console.error("Seed failed:", error);
            process.exit(1);
        });
}
