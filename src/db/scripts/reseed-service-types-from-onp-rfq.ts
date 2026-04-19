/**
 * Reseed platform service_types catalog from the ONP 3PL RFQ pricing sheet.
 *
 * Context:
 *  - Sheet rates are SELL-side (margin-inclusive, client-facing).
 *  - Line items / service_types store BUY-side. Pricing engine applies margin
 *    at projection time from companies.platform_margin_percent (platform
 *    standard is 20%).
 *  - Stored rate = ceil-half( sheet_sell / 1.20 ).
 *  - Variants live in name (metadata JSONB is not rendered anywhere in UI).
 *  - Catalog is platform-scoped; same rates apply to every company under a
 *    given platform. Companies that negotiate different rates will need a
 *    per-company catalog layer later.
 *
 * Behavior:
 *  - Deactivates the pre-existing 14 generic placeholder rows (is_active=false,
 *    not deleted — line_items may FK them).
 *  - Upserts ~65 new rows keyed on (platform, name). Re-running is safe and
 *    will refresh default_rate / description / display_order to match this file.
 *
 * Run (staging only):
 *   APP_ENV=staging bunx tsx src/db/scripts/reseed-service-types-from-onp-rfq.ts [--dry-run]
 */

import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "..";
import { assertAppEnv } from "../safety/guards";
import { platforms, serviceTypes } from "../schema";

assertAppEnv(["staging", "production"]);

const DRY_RUN = process.argv.includes("--dry-run");

const MARGIN = 1.2;

/** Ceil to the nearest 0.5 (e.g. 1.23 → 1.5, 1.77 → 2.0, 116.67 → 117.0). */
const ceilHalf = (n: number) => Math.ceil(n * 2) / 2;

const buyOf = (sell: number) => ceilHalf(sell / MARGIN);

type Row = {
    name: string;
    category: "HANDLING" | "ASSEMBLY" | "TRANSPORT" | "EQUIPMENT" | "OTHER" | "RESKIN";
    unit: string;
    sheet_sell: number;
    description: string;
};

const rows: Row[] = [];

// --- Handling & Picking (per m³, >12 hour time frame) ---
rows.push({
    name: "Handling — In",
    category: "HANDLING",
    unit: "m3",
    sheet_sell: 9.6,
    description: "Inbound handling, per m³. >12 hour time frame.",
});
rows.push({
    name: "Handling — Out",
    category: "HANDLING",
    unit: "m3",
    sheet_sell: 9.6,
    description: "Outbound handling, per m³. >12 hour time frame.",
});
rows.push({
    name: "Picking",
    category: "HANDLING",
    unit: "m3",
    sheet_sell: 6.0,
    description: "Order picking, per m³. >12 hour time frame.",
});

// --- Assembly & Disassembly (per labour-hour) ---
rows.push({
    name: "Assembly — Weekday",
    category: "ASSEMBLY",
    unit: "hour",
    sheet_sell: 18,
    description: "Per labour-hour, working days (24 hrs).",
});
rows.push({
    name: "Assembly — Holiday",
    category: "ASSEMBLY",
    unit: "hour",
    sheet_sell: 25,
    description: "Per labour-hour, Fridays / national holidays (24 hrs).",
});

// --- Transport (van/standard) ---
// Sheet emirate → [one_way, round_trip, additional_trip]
const transportRates: Record<string, [number, number, number]> = {
    Dubai: [300, 500, 180],
    "Abu Dhabi": [495, 990, 180],
    "Al Ain": [550, 1100, 180],
    Sharjah: [400, 600, 180],
    Ajman: [400, 750, 180],
    "Ras Al Khaimah": [550, 1100, 180],
    "Umm Al Quwain": [550, 1100, 180],
    Fujairah: [600, 1100, 180],
};
for (const [emirate, [oneWay, roundTrip, additional]] of Object.entries(transportRates)) {
    rows.push({
        name: `Transport — ${emirate} — One Way`,
        category: "TRANSPORT",
        unit: "trip",
        sheet_sell: oneWay,
        description: `Standard transport, ${emirate}, one way.`,
    });
    rows.push({
        name: `Transport — ${emirate} — Round Trip`,
        category: "TRANSPORT",
        unit: "trip",
        sheet_sell: roundTrip,
        description: `Standard transport, ${emirate}, round trip.`,
    });
    rows.push({
        name: `Transport — ${emirate} — Additional Trip`,
        category: "TRANSPORT",
        unit: "trip",
        sheet_sell: additional,
        description: `Additional trip within ${emirate}.`,
    });
}

// --- Special Equipment (7-ton / 10-ton hire, one-way DIP → event) ---
// Sheet location → [7_ton, 10_ton]
const truckHireRates: Record<string, [number, number]> = {
    Dubai: [900, 1140],
    "Abu Dhabi City": [1200, 1380],
    Musaffah: [1140, 1200],
    "Sharjah Hamriya": [1200, 1320],
    "Sharjah City": [1200, 1320],
    "Al Ain": [1200, 1320],
    Ajman: [1260, 1320],
    Fujairah: [1440, 1440],
    "RAK City": [1320, 1320],
};
for (const [location, [sevenTon, tenTon]] of Object.entries(truckHireRates)) {
    rows.push({
        name: `Truck Hire — ${location} — 7-ton`,
        category: "TRANSPORT",
        unit: "trip",
        sheet_sell: sevenTon,
        description: `7-ton truck hire, pickup DIP → event location in ${location}, one way.`,
    });
    rows.push({
        name: `Truck Hire — ${location} — 10-ton`,
        category: "TRANSPORT",
        unit: "trip",
        sheet_sell: tenTon,
        description: `10-ton truck hire, pickup DIP → event location in ${location}, one way.`,
    });
}

// --- Forklift on-site (per hour, with minimum-hour business rule) ---
// All 3 listed locations share the same per-hour rates.
const forkliftHourly: Array<[string, string]> = [
    ["Dubai", "On-site min 10 hours apply. Warehouse min 4 hours apply for >5-ton."],
    ["Abu Dhabi City", "On-site min 10 hours apply."],
    ["Musaffah", "On-site min 10 hours apply."],
];
const forkliftHourlyTonnages: Array<[string, number]> = [
    ["3-ton", 140],
    ["5-ton", 200],
    ["10-ton", 260],
];
for (const [location, note] of forkliftHourly) {
    for (const [tonnage, sell] of forkliftHourlyTonnages) {
        rows.push({
            name: `Forklift On-Site — ${location} — ${tonnage}`,
            category: "EQUIPMENT",
            unit: "hour",
            sheet_sell: sell,
            description: `On-site forklift operation, ${tonnage}, ${location}. ${note}`,
        });
    }
}

// --- Forklift mobilisation + demobilisation ---
// Sheet location → [3_ton, 5_ton, 10_ton]
const forkliftMobRates: Record<string, [number, number, number]> = {
    Dubai: [960, 1080, 1440],
    "Abu Dhabi City": [1440, 1560, 2220],
    Musaffah: [1440, 1560, 2220],
};
for (const [location, [threeTon, fiveTon, tenTon]] of Object.entries(forkliftMobRates)) {
    rows.push({
        name: `Forklift Mob+Demob — ${location} — 3-ton`,
        category: "EQUIPMENT",
        unit: "trip",
        sheet_sell: threeTon,
        description: `Forklift mobilisation + demobilisation, 3-ton, ${location}.`,
    });
    rows.push({
        name: `Forklift Mob+Demob — ${location} — 5-ton`,
        category: "EQUIPMENT",
        unit: "trip",
        sheet_sell: fiveTon,
        description: `Forklift mobilisation + demobilisation, 5-ton, ${location}.`,
    });
    rows.push({
        name: `Forklift Mob+Demob — ${location} — 10-ton`,
        category: "EQUIPMENT",
        unit: "trip",
        sheet_sell: tenTon,
        description: `Forklift mobilisation + demobilisation, 10-ton, ${location}.`,
    });
}

// Legacy rows to deactivate (not delete) — line_items.service_type_id FKs may
// reference them. Two cohorts:
//   1. Generic placeholder seed (14 names) — present on staging.
//   2. Earlier "middle-dot" transport seed (30 names) — present on prod only,
//      stored at sell-side rates that would double-margin through the pricing
//      engine. Superseded by the new em-dash catalog.
const LEGACY_PLACEHOLDER_NAMES = [
    // Cohort 1 — generic placeholders
    "Basic Assembly",
    "Complex Assembly",
    "Forklift Operation",
    "Loading / Unloading",
    "Fragile Item Handling",
    "Vinyl Wrap",
    "Storage Fee",
    "Cleaning Service",
    "Transport - Dubai (One Way)",
    "Transport - Dubai (Round Trip)",
    "Transport - Abu Dhabi (One Way)",
    "Transport - Abu Dhabi (Round Trip)",
    "Transport - Sharjah (One Way)",
    "Transport - Sharjah (Round Trip)",
    // Cohort 2 — middle-dot transport seed (prod)
    "Transport - Abu Dhabi · Standard Truck (One-way)",
    "Transport - Abu Dhabi · Standard Truck (Round-trip)",
    "Transport - Abu Dhabi · 7 Ton Truck (One-way)",
    "Transport - Abu Dhabi · 7 Ton Truck (Round-trip)",
    "Transport - Abu Dhabi · 10 Ton Truck (One-way)",
    "Transport - Abu Dhabi · 10 Ton Truck (Round-trip)",
    "Transport - Ajman · Standard Truck (One-way)",
    "Transport - Ajman · Standard Truck (Round-trip)",
    "Transport - Ajman · 7 Ton Truck (One-way)",
    "Transport - Ajman · 7 Ton Truck (Round-trip)",
    "Transport - Ajman · 10 Ton Truck (One-way)",
    "Transport - Ajman · 10 Ton Truck (Round-trip)",
    "Transport - Dubai · Standard Truck (One-way)",
    "Transport - Dubai · Standard Truck (Round-trip)",
    "Transport - Dubai · 7 Ton Truck (One-way)",
    "Transport - Dubai · 7 Ton Truck (Round-trip)",
    "Transport - Dubai · 10 Ton Truck (One-way)",
    "Transport - Dubai · 10 Ton Truck (Round-trip)",
    "Transport - Ras Al Khaimah · Standard Truck (One-way)",
    "Transport - Ras Al Khaimah · Standard Truck (Round-trip)",
    "Transport - Ras Al Khaimah · 7 Ton Truck (One-way)",
    "Transport - Ras Al Khaimah · 7 Ton Truck (Round-trip)",
    "Transport - Ras Al Khaimah · 10 Ton Truck (One-way)",
    "Transport - Ras Al Khaimah · 10 Ton Truck (Round-trip)",
    "Transport - Sharjah · Standard Truck (One-way)",
    "Transport - Sharjah · Standard Truck (Round-trip)",
    "Transport - Sharjah · 7 Ton Truck (One-way)",
    "Transport - Sharjah · 7 Ton Truck (Round-trip)",
    "Transport - Sharjah · 10 Ton Truck (One-way)",
    "Transport - Sharjah · 10 Ton Truck (Round-trip)",
];

async function main() {
    console.log("🧾 Reseeding service_types catalog from ONP 3PL RFQ sheet.");
    console.log(`    Margin assumption: ${((MARGIN - 1) * 100).toFixed(0)}%`);
    console.log(`    Rows to upsert per platform: ${rows.length}`);
    if (DRY_RUN) {
        console.log("    MODE: --dry-run (no DB writes)");
    }

    const allPlatforms = await db
        .select({ id: platforms.id, name: platforms.name })
        .from(platforms);

    if (allPlatforms.length === 0) {
        console.log("⚠️  No platforms found — nothing to seed.");
        process.exit(0);
    }

    for (const platform of allPlatforms) {
        console.log(`\n  Platform: ${platform.name} (${platform.id})`);

        if (DRY_RUN) {
            // Count legacy placeholder rows that WOULD be deactivated.
            const legacyHits = await db
                .select({ id: serviceTypes.id, name: serviceTypes.name })
                .from(serviceTypes)
                .where(
                    and(
                        eq(serviceTypes.platform_id, platform.id),
                        inArray(serviceTypes.name, LEGACY_PLACEHOLDER_NAMES)
                    )
                );
            console.log(`    ↳ WOULD deactivate ${legacyHits.length} legacy placeholder rows:`);
            for (const hit of legacyHits) {
                console.log(`        • ${hit.name}`);
            }

            // Count existing new-name rows that would be updated vs inserted.
            const existingNewNames = await db
                .select({ name: serviceTypes.name })
                .from(serviceTypes)
                .where(
                    and(
                        eq(serviceTypes.platform_id, platform.id),
                        inArray(
                            serviceTypes.name,
                            rows.map((r) => r.name)
                        )
                    )
                );
            const existingSet = new Set(existingNewNames.map((r) => r.name));
            const wouldUpdate = rows.filter((r) => existingSet.has(r.name)).length;
            const wouldInsert = rows.length - wouldUpdate;
            console.log(
                `    ↳ WOULD upsert ${rows.length} rows ` +
                    `(${wouldInsert} inserts, ${wouldUpdate} updates)`
            );
            console.log(`    ↳ computed buy rates (sheet_sell → stored_buy):`);
            for (const r of rows) {
                const buy = buyOf(r.sheet_sell);
                const marker = existingSet.has(r.name) ? "UPD" : "NEW";
                console.log(
                    `        [${marker}] ${r.name.padEnd(55)} ` +
                        `${r.sheet_sell.toString().padStart(7)} → ${buy.toFixed(2).padStart(8)} / ${r.unit}`
                );
            }
            continue;
        }

        // --- LIVE PATH ---
        const deactivated = await db
            .update(serviceTypes)
            .set({ is_active: false, updated_at: new Date() })
            .where(
                and(
                    eq(serviceTypes.platform_id, platform.id),
                    inArray(serviceTypes.name, LEGACY_PLACEHOLDER_NAMES)
                )
            )
            .returning({ id: serviceTypes.id });
        console.log(`    ↳ deactivated ${deactivated.length} legacy placeholder rows`);

        let display_order = 0;
        let upserted = 0;
        for (const r of rows) {
            const buy = buyOf(r.sheet_sell);
            await db
                .insert(serviceTypes)
                .values({
                    platform_id: platform.id,
                    name: r.name,
                    category: r.category,
                    unit: r.unit,
                    default_rate: buy.toFixed(2),
                    default_metadata: {},
                    description: r.description,
                    display_order,
                    is_active: true,
                    updated_at: new Date(),
                })
                .onConflictDoUpdate({
                    target: [serviceTypes.platform_id, serviceTypes.name],
                    set: {
                        category: r.category,
                        unit: r.unit,
                        default_rate: buy.toFixed(2),
                        description: r.description,
                        display_order,
                        is_active: true,
                        updated_at: new Date(),
                    },
                });
            display_order++;
            upserted++;
        }
        console.log(`    ↳ upserted ${upserted} catalog rows`);
    }

    console.log(DRY_RUN ? "\n✅ Dry run complete (no changes written)." : "\n✅ Done.");
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Reseed failed:", err);
    process.exit(1);
});
