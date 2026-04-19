/**
 * Demo catalog seed — rich enough for docs screenshots.
 *
 * Three asset families spanning POOLED + SERIALIZED stock modes and
 * GREEN/ORANGE/RED conditions, plus one collection bundling items across
 * families. All identifiers come from `demo-deterministic.ts` so screenshots
 * stay diffable across reseeds.
 *
 * Image URLs use placehold.co (same pattern as brand logos in seed-pr.ts).
 * Each asset gets a per-asset deterministic URL — same name → same image.
 */

import { db } from "../index";
import * as schema from "../schema";
import { DEMO_UUIDS } from "./demo-deterministic";

const placeholderImage = (label: string, color: string): { url: string; note?: string }[] => [
    {
        url: `https://placehold.co/512x512/${color}/FFFFFF?text=${encodeURIComponent(label)}`,
    },
];

export type SeedDemoCatalogOpts = {
    platformId: string;
    companyId: string;
    warehouseId: string;
    zoneId: string;
    brandPrimaryId: string;
    brandSecondaryId: string;
};

export type SeededCatalog = {
    families: {
        eventChairs: { id: string };
        backdropPanels: { id: string };
        ledScreens: { id: string };
    };
    assets: {
        eventChairsBatch: { id: string };
        backdropGreen1: { id: string };
        backdropGreen2: { id: string };
        backdropOrange: { id: string };
        backdropRed: { id: string };
        ledScreen1: { id: string };
        ledScreen2: { id: string };
        ledScreen3: { id: string };
    };
    collection: { id: string };
};

export const seedDemoCatalog = async (opts: SeedDemoCatalogOpts): Promise<SeededCatalog> => {
    console.log("📦 Seeding demo catalog (families + assets + collection)...");

    // ─── Families ────────────────────────────────────────────
    await db.insert(schema.assetFamilies).values([
        {
            id: DEMO_UUIDS.families.eventChairs,
            platform_id: opts.platformId,
            company_id: opts.companyId,
            brand_id: opts.brandPrimaryId,
            name: "Event Chairs",
            category_id: DEMO_UUIDS.assetCategories.furniture,
            description: "Stackable chairs for corporate events.",
            stock_mode: "POOLED",
            weight_per_unit: "3.20",
            dimensions: { length: 50, width: 45, height: 90 },
            volume_per_unit: "0.203",
            images: placeholderImage("Event Chairs", "1f2937"),
            is_active: true,
        },
        {
            id: DEMO_UUIDS.families.backdropPanels,
            platform_id: opts.platformId,
            company_id: opts.companyId,
            brand_id: opts.brandPrimaryId,
            name: "Backdrop Panels",
            category_id: DEMO_UUIDS.assetCategories.decor,
            description: "Modular backdrop panels for stage and photo walls.",
            stock_mode: "SERIALIZED",
            weight_per_unit: "12.00",
            dimensions: { length: 200, width: 10, height: 250 },
            volume_per_unit: "5.000",
            images: placeholderImage("Backdrop Panels", "374151"),
            is_active: true,
        },
        {
            id: DEMO_UUIDS.families.ledScreens,
            platform_id: opts.platformId,
            company_id: opts.companyId,
            brand_id: opts.brandSecondaryId,
            name: "LED Screens",
            category_id: DEMO_UUIDS.assetCategories.installation,
            description: "P3 indoor LED video walls (per panel).",
            stock_mode: "SERIALIZED",
            weight_per_unit: "8.50",
            dimensions: { length: 50, width: 8, height: 50 },
            volume_per_unit: "0.020",
            images: placeholderImage("LED Screens", "4b5563"),
            is_active: true,
        },
    ]);

    // ─── Assets ──────────────────────────────────────────────
    const baseAssetCols = {
        platform_id: opts.platformId,
        company_id: opts.companyId,
        warehouse_id: opts.warehouseId,
        zone_id: opts.zoneId,
        category: "Furniture",
    };

    await db.insert(schema.assets).values([
        // Event Chairs — POOLED batch
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.eventChairsBatch,
            brand_id: opts.brandPrimaryId,
            family_id: DEMO_UUIDS.families.eventChairs,
            name: "Event Chair (batch)",
            category: "Furniture",
            tracking_method: "BATCH",
            total_quantity: 30,
            available_quantity: 30,
            qr_code: "DEMO-CHAIRS-BATCH",
            weight_per_unit: "3.20",
            dimensions: { length: 50, width: 45, height: 90 },
            volume_per_unit: "0.203",
            images: placeholderImage("Chair", "1f2937"),
            condition: "GREEN",
            status: "AVAILABLE",
        },

        // Backdrop Panels — SERIALIZED, condition mix
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.backdropGreen1,
            brand_id: opts.brandPrimaryId,
            family_id: DEMO_UUIDS.families.backdropPanels,
            name: "Backdrop Panel #1",
            category: "Decor",
            tracking_method: "INDIVIDUAL",
            total_quantity: 1,
            available_quantity: 1,
            qr_code: "DEMO-BACKDROP-001",
            weight_per_unit: "12.00",
            dimensions: { length: 200, width: 10, height: 250 },
            volume_per_unit: "5.000",
            images: placeholderImage("Backdrop 1", "374151"),
            condition: "GREEN",
            status: "AVAILABLE",
        },
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.backdropGreen2,
            brand_id: opts.brandPrimaryId,
            family_id: DEMO_UUIDS.families.backdropPanels,
            name: "Backdrop Panel #2",
            category: "Decor",
            tracking_method: "INDIVIDUAL",
            total_quantity: 1,
            available_quantity: 1,
            qr_code: "DEMO-BACKDROP-002",
            weight_per_unit: "12.00",
            dimensions: { length: 200, width: 10, height: 250 },
            volume_per_unit: "5.000",
            images: placeholderImage("Backdrop 2", "374151"),
            condition: "GREEN",
            status: "AVAILABLE",
        },
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.backdropOrange,
            brand_id: opts.brandPrimaryId,
            family_id: DEMO_UUIDS.families.backdropPanels,
            name: "Backdrop Panel #3",
            category: "Decor",
            tracking_method: "INDIVIDUAL",
            total_quantity: 1,
            available_quantity: 1,
            qr_code: "DEMO-BACKDROP-003",
            weight_per_unit: "12.00",
            dimensions: { length: 200, width: 10, height: 250 },
            volume_per_unit: "5.000",
            images: placeholderImage("Backdrop 3", "f59e0b"),
            condition: "ORANGE",
            condition_notes: "Minor scuffs on the front face — usable but flag for client review.",
            refurb_days_estimate: 2,
            status: "AVAILABLE",
        },
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.backdropRed,
            brand_id: opts.brandPrimaryId,
            family_id: DEMO_UUIDS.families.backdropPanels,
            name: "Backdrop Panel #4",
            category: "AV Equipment",
            tracking_method: "INDIVIDUAL",
            total_quantity: 1,
            available_quantity: 0,
            qr_code: "DEMO-BACKDROP-004",
            weight_per_unit: "12.00",
            dimensions: { length: 200, width: 10, height: 250 },
            volume_per_unit: "5.000",
            images: placeholderImage("Backdrop 4", "dc2626"),
            condition: "RED",
            condition_notes: "Frame cracked — out for repair.",
            refurb_days_estimate: 14,
            status: "MAINTENANCE",
        },

        // LED Screens — SERIALIZED, all GREEN
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.ledScreen1,
            brand_id: opts.brandSecondaryId,
            family_id: DEMO_UUIDS.families.ledScreens,
            name: "LED Screen #1",
            category: "AV Equipment",
            tracking_method: "INDIVIDUAL",
            total_quantity: 1,
            available_quantity: 1,
            qr_code: "DEMO-LED-001",
            weight_per_unit: "8.50",
            dimensions: { length: 50, width: 8, height: 50 },
            volume_per_unit: "0.020",
            images: placeholderImage("LED 1", "4b5563"),
            condition: "GREEN",
            status: "AVAILABLE",
        },
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.ledScreen2,
            brand_id: opts.brandSecondaryId,
            family_id: DEMO_UUIDS.families.ledScreens,
            name: "LED Screen #2",
            category: "AV Equipment",
            tracking_method: "INDIVIDUAL",
            total_quantity: 1,
            available_quantity: 1,
            qr_code: "DEMO-LED-002",
            weight_per_unit: "8.50",
            dimensions: { length: 50, width: 8, height: 50 },
            volume_per_unit: "0.020",
            images: placeholderImage("LED 2", "4b5563"),
            condition: "GREEN",
            status: "AVAILABLE",
        },
        {
            ...baseAssetCols,
            id: DEMO_UUIDS.assets.ledScreen3,
            brand_id: opts.brandSecondaryId,
            family_id: DEMO_UUIDS.families.ledScreens,
            name: "LED Screen #3",
            category: "AV Equipment",
            tracking_method: "INDIVIDUAL",
            total_quantity: 1,
            available_quantity: 1,
            qr_code: "DEMO-LED-003",
            weight_per_unit: "8.50",
            dimensions: { length: 50, width: 8, height: 50 },
            volume_per_unit: "0.020",
            images: placeholderImage("LED 3", "4b5563"),
            condition: "GREEN",
            status: "AVAILABLE",
        },
    ]);

    // ─── Collection ──────────────────────────────────────────
    await db.insert(schema.collections).values({
        id: DEMO_UUIDS.collection,
        platform_id: opts.platformId,
        company_id: opts.companyId,
        brand_id: opts.brandPrimaryId,
        name: "Corporate Event Package",
        description: "Curated bundle for medium-size corporate events: stage backdrop + LED + seating.",
        category: "Bundle",
        images: [
            `https://placehold.co/512x512/1f2937/FFFFFF?text=${encodeURIComponent("Corporate Package")}`,
        ],
        is_active: true,
    });

    await db.insert(schema.collectionItems).values([
        {
            collection: DEMO_UUIDS.collection,
            asset: DEMO_UUIDS.assets.eventChairsBatch,
            default_quantity: 20,
            notes: "Stackable seating",
            display_order: 0,
        },
        {
            collection: DEMO_UUIDS.collection,
            asset: DEMO_UUIDS.assets.backdropGreen1,
            default_quantity: 1,
            notes: "Stage backdrop — left",
            display_order: 1,
        },
        {
            collection: DEMO_UUIDS.collection,
            asset: DEMO_UUIDS.assets.backdropGreen2,
            default_quantity: 1,
            notes: "Stage backdrop — right",
            display_order: 2,
        },
        {
            collection: DEMO_UUIDS.collection,
            asset: DEMO_UUIDS.assets.ledScreen1,
            default_quantity: 1,
            notes: "Center LED panel",
            display_order: 3,
        },
    ]);

    console.log(`  ✓ 3 families + 8 assets + 1 collection (4 items)`);

    return {
        families: {
            eventChairs: { id: DEMO_UUIDS.families.eventChairs },
            backdropPanels: { id: DEMO_UUIDS.families.backdropPanels },
            ledScreens: { id: DEMO_UUIDS.families.ledScreens },
        },
        assets: {
            eventChairsBatch: { id: DEMO_UUIDS.assets.eventChairsBatch },
            backdropGreen1: { id: DEMO_UUIDS.assets.backdropGreen1 },
            backdropGreen2: { id: DEMO_UUIDS.assets.backdropGreen2 },
            backdropOrange: { id: DEMO_UUIDS.assets.backdropOrange },
            backdropRed: { id: DEMO_UUIDS.assets.backdropRed },
            ledScreen1: { id: DEMO_UUIDS.assets.ledScreen1 },
            ledScreen2: { id: DEMO_UUIDS.assets.ledScreen2 },
            ledScreen3: { id: DEMO_UUIDS.assets.ledScreen3 },
        },
        collection: { id: DEMO_UUIDS.collection },
    };
};
