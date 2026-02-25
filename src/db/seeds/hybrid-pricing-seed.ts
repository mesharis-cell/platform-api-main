/**
 * Hybrid Pricing System - Seed Data
 * Seeds pricing_config, transport_rates, and service_types tables
 */

import { db } from "../index";
import { transportRates, serviceTypes, platforms, cities, vehicleTypes } from "../schema";
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

        const platformCities = await db
            .select({ id: cities.id, name: cities.name })
            .from(cities)
            .where(eq(cities.platform_id, platform.id));
        const cityMap = new Map(platformCities.map((city) => [city.name, city.id]));
        const cityNameById = new Map(platformCities.map((city) => [city.id, city.name]));

        const [defaultVehicleType] = await db
            .select({
                id: vehicleTypes.id,
            })
            .from(vehicleTypes)
            .where(eq(vehicleTypes.platform_id, platform.id))
            .limit(1);

        if (!defaultVehicleType) {
            console.log(
                "  ⚠️  No vehicle types found for this platform. Skipping transport rates seed."
            );
        }

        // ============================================================
        // 2. TRANSPORT RATES
        // ============================================================
        console.log("  → Creating transport rates...");

        const transportData = [
            { city: "Dubai", trip_type: "ONE_WAY", rate: "300.00" },
            { city: "Dubai", trip_type: "ROUND_TRIP", rate: "500.00" },
            {
                city: "Abu Dhabi",
                trip_type: "ONE_WAY",
                rate: "495.00",
            },
            {
                city: "Abu Dhabi",
                trip_type: "ROUND_TRIP",
                rate: "990.00",
            },
            { city: "Sharjah", trip_type: "ONE_WAY", rate: "400.00" },
            {
                city: "Sharjah",
                trip_type: "ROUND_TRIP",
                rate: "600.00",
            },
            { city: "Ajman", trip_type: "ONE_WAY", rate: "400.00" },
            { city: "Ajman", trip_type: "ROUND_TRIP", rate: "750.00" },
            {
                city: "Ras Al Khaimah",
                trip_type: "ONE_WAY",
                rate: "550.00",
            },
            {
                city: "Ras Al Khaimah",
                trip_type: "ROUND_TRIP",
                rate: "1100.00",
            },
            {
                city: "Umm Al Quwain",
                trip_type: "ONE_WAY",
                rate: "550.00",
            },
            {
                city: "Umm Al Quwain",
                trip_type: "ROUND_TRIP",
                rate: "1100.00",
            },
            { city: "Fujairah", trip_type: "ONE_WAY", rate: "600.00" },
            {
                city: "Fujairah",
                trip_type: "ROUND_TRIP",
                rate: "1100.00",
            },
        ];

        const existingTransport = await db
            .select()
            .from(transportRates)
            .where(eq(transportRates.platform_id, platform.id))
            .limit(1);

        let transportCreated = 0;
        if (existingTransport.length === 0 && defaultVehicleType) {
            for (const rate of transportData) {
                const cityId = cityMap.get(rate.city);
                if (!cityId) {
                    console.log(`     ↳ Skipping rate for missing city: ${rate.city}`);
                    continue;
                }
                await db.insert(transportRates).values({
                    platform_id: platform.id,
                    company_id: null, // Platform default
                    city_id: cityId,
                    area: null,
                    trip_type: rate.trip_type as any,
                    vehicle_type_id: defaultVehicleType.id,
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

        const platformTransportRates = await db
            .select({
                id: transportRates.id,
                city_id: transportRates.city_id,
                trip_type: transportRates.trip_type,
                vehicle_type_id: transportRates.vehicle_type_id,
                rate: transportRates.rate,
                is_active: transportRates.is_active,
            })
            .from(transportRates)
            .where(eq(transportRates.platform_id, platform.id));

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
                    default_metadata: {},
                    transport_rate_id: null,
                    description: service.description,
                    display_order: service.display_order,
                    is_active: true,
                });
                servicesCreated++;
            }

            const transportServiceData = platformTransportRates
                .filter(
                    (rate) =>
                        rate.is_active &&
                        (!defaultVehicleType || rate.vehicle_type_id === defaultVehicleType.id)
                )
                .map((rate, idx) => {
                    const cityName = cityNameById.get(rate.city_id) || "Unknown City";
                    const tripLabel = rate.trip_type === "ROUND_TRIP" ? "Round Trip" : "One Way";
                    return {
                        name: `Transport - ${cityName} (${tripLabel})`,
                        category: "TRANSPORT" as const,
                        unit: "trip",
                        default_rate: rate.rate,
                        default_metadata: {
                            city_id: rate.city_id,
                            city_name: cityName,
                            trip_direction: rate.trip_type,
                            vehicle_type_id: rate.vehicle_type_id,
                        },
                        transport_rate_id: rate.id,
                        description: `Transport service synced from ${cityName} ${tripLabel} rate card`,
                        display_order: serviceTypeData.length + idx + 1,
                    };
                });

            for (const service of transportServiceData) {
                await db.insert(serviceTypes).values({
                    platform_id: platform.id,
                    name: service.name,
                    category: service.category,
                    unit: service.unit,
                    default_rate: service.default_rate,
                    default_metadata: service.default_metadata,
                    transport_rate_id: service.transport_rate_id,
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
