/**
 * Shared seed module: service types.
 *
 * Canonical 14 service types for a platform. Single source of truth — any
 * future seed should import this rather than re-declaring the list.
 *
 * Consumers: src/db/seed-test.ts
 * Future consumers: seed.ts, seed-pr.ts, seed-demo-pr.ts (refactor task).
 */

import { db } from "../index";
import * as schema from "../schema";

type ServiceTypeInput = {
    name: string;
    category: "ASSEMBLY" | "EQUIPMENT" | "HANDLING" | "RESKIN" | "OTHER" | "TRANSPORT";
    unit: string;
    default_rate: string;
};

export const CANONICAL_SERVICE_TYPES: ServiceTypeInput[] = [
    { name: "Basic Assembly", category: "ASSEMBLY", unit: "hour", default_rate: "75.00" },
    { name: "Complex Assembly", category: "ASSEMBLY", unit: "hour", default_rate: "120.00" },
    { name: "Forklift Operation", category: "EQUIPMENT", unit: "hour", default_rate: "200.00" },
    { name: "Loading / Unloading", category: "HANDLING", unit: "hour", default_rate: "60.00" },
    { name: "Fragile Item Handling", category: "HANDLING", unit: "unit", default_rate: "25.00" },
    { name: "Vinyl Wrap", category: "RESKIN", unit: "unit", default_rate: "300.00" },
    { name: "Storage Fee", category: "OTHER", unit: "day", default_rate: "50.00" },
    { name: "Cleaning Service", category: "OTHER", unit: "unit", default_rate: "35.00" },
    {
        name: "Transport - Dubai (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        default_rate: "500.00",
    },
    {
        name: "Transport - Dubai (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        default_rate: "900.00",
    },
    {
        name: "Transport - Abu Dhabi (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        default_rate: "800.00",
    },
    {
        name: "Transport - Abu Dhabi (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        default_rate: "1440.00",
    },
    {
        name: "Transport - Sharjah (One Way)",
        category: "TRANSPORT",
        unit: "trip",
        default_rate: "400.00",
    },
    {
        name: "Transport - Sharjah (Round Trip)",
        category: "TRANSPORT",
        unit: "trip",
        default_rate: "600.00",
    },
];

export type SeedServiceTypesOpts = {
    platformId: string;
};

export const seedServiceTypes = async (opts: SeedServiceTypesOpts) => {
    const rows = CANONICAL_SERVICE_TYPES.map((s, i) => ({
        platform_id: opts.platformId,
        ...s,
        display_order: i,
        is_active: true,
    }));
    return db.insert(schema.serviceTypes).values(rows).returning();
};
