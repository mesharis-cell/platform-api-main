/**
 * Asset Catalog Export — CLI script.
 *
 * Produces the same output as the (currently-stubbed) admin asset-catalog
 * endpoint, but runs locally against the chosen APP_ENV's database. Lives
 * here because:
 *   - Large photo-embedded exports can exceed the API instance's RAM
 *     budget (t2.micro on staging today). Running locally has no such
 *     ceiling.
 *   - The endpoint is intentionally off; PMG runs this on-demand and
 *     delivers the file to the client.
 *
 * Usage:
 *   APP_ENV=staging bun run export:asset-catalog -- \
 *       --platform-id <uuid> \
 *       [--company-id <uuid>] [--brand-id <uuid>] \
 *       [--condition GREEN|ORANGE|RED] [--status AVAILABLE|BOOKED|OUT|MAINTENANCE] \
 *       [--category-id <uuid>] \
 *       [--include-photos] \
 *       [--out <path>]
 *
 * Defaults:
 *   - Output path: ./asset-catalog-<company-or-all>-<YYYY-MM-DD>.(xlsx|csv)
 *   - Format: CSV unless --include-photos is present (then XLSX with
 *     embedded thumbnails).
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { and, asc, eq, isNull } from "drizzle-orm";
import { assertAppEnv } from "../safety/guards";
import { db, pool } from "../../db";
import {
    assetCategories,
    assets,
    assetFamilies,
    brands,
    companies,
    teams,
    users,
    warehouses,
    zones,
} from "../../db/schema";
import {
    generateAssetCatalogCsvRows,
    generateAssetCatalogXlsx,
    type AssetCatalogRow,
} from "../../app/utils/asset-catalog-xlsx";

// Read-only script but still touches a real DB — refuse to run without an
// explicit APP_ENV so nobody accidentally points at prod assuming staging.
assertAppEnv(["staging", "production", "testing"]);

const getArg = (name: string) => {
    const idx = process.argv.indexOf(`--${name}`);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const readDim = (dims: unknown, key: "length" | "width" | "height"): number | null => {
    if (!dims || typeof dims !== "object") return null;
    const v = (dims as Record<string, unknown>)[key];
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const resolveImageUrl = (row: {
    on_display_image: string | null;
    images_asset: unknown;
    images_family: unknown;
}): string | null => {
    if (row.on_display_image) return row.on_display_image;
    const assetImages = (row.images_asset as { url?: string }[] | null) ?? [];
    if (assetImages.length > 0 && assetImages[0]?.url) return assetImages[0].url;
    const familyImages = (row.images_family as { url?: string }[] | null) ?? [];
    if (familyImages.length > 0 && familyImages[0]?.url) return familyImages[0].url;
    return null;
};

async function main() {
    const platformId = getArg("platform-id");
    const companyId = getArg("company-id");
    const brandId = getArg("brand-id");
    const condition = getArg("condition");
    const status = getArg("status");
    const categoryId = getArg("category-id");
    const includePhotos = hasFlag("include-photos");
    const outArg = getArg("out");

    if (!platformId) {
        console.error(
            "Usage: APP_ENV=<env> bun run export:asset-catalog -- --platform-id <uuid> " +
                "[--company-id <uuid>] [--brand-id <uuid>] [--condition GREEN|ORANGE|RED] " +
                "[--status AVAILABLE|BOOKED|OUT|MAINTENANCE] [--category-id <uuid>] " +
                "[--include-photos] [--out <path>]"
        );
        process.exit(2);
    }

    const conditions: any[] = [eq(assets.platform_id, platformId), isNull(assets.deleted_at)];
    if (companyId) conditions.push(eq(assets.company_id, companyId));
    if (brandId) conditions.push(eq(assets.brand_id, brandId));
    if (condition) conditions.push(eq(assets.condition, condition as any));
    if (status) conditions.push(eq(assets.status, status as any));
    if (categoryId) conditions.push(eq(assetFamilies.category_id, categoryId));

    console.log(
        `[catalog] querying assets for platform=${platformId}` +
            (companyId ? ` company=${companyId}` : "") +
            (brandId ? ` brand=${brandId}` : "") +
            (condition ? ` condition=${condition}` : "") +
            (status ? ` status=${status}` : "") +
            (categoryId ? ` category=${categoryId}` : "")
    );

    const dbRows = await db
        .select({
            asset_id: assets.id,
            asset_name: assets.name,
            qr_code: assets.qr_code,
            tracking_method: assets.tracking_method,
            total_quantity: assets.total_quantity,
            available_quantity: assets.available_quantity,
            condition: assets.condition,
            status: assets.status,
            condition_notes: assets.condition_notes,
            refurb_days_estimate: assets.refurb_days_estimate,
            packaging_asset: assets.packaging,
            weight_per_unit_asset: assets.weight_per_unit,
            volume_per_unit_asset: assets.volume_per_unit,
            dimensions_asset: assets.dimensions,
            handling_tags_asset: assets.handling_tags,
            on_display_image: assets.on_display_image,
            images_asset: assets.images,
            last_scanned_at: assets.last_scanned_at,
            created_at: assets.created_at,
            last_scanned_by_name: users.name,
            family_id: assetFamilies.id,
            family_name: assetFamilies.name,
            company_item_code: assetFamilies.company_item_code,
            description: assetFamilies.description,
            stock_mode: assetFamilies.stock_mode,
            low_stock_threshold: assetFamilies.low_stock_threshold,
            packaging_family: assetFamilies.packaging,
            weight_per_unit_family: assetFamilies.weight_per_unit,
            volume_per_unit_family: assetFamilies.volume_per_unit,
            dimensions_family: assetFamilies.dimensions,
            handling_tags_family: assetFamilies.handling_tags,
            images_family: assetFamilies.images,
            company_name: companies.name,
            brand_name: brands.name,
            category_name: assetCategories.name,
            team_name: teams.name,
            warehouse_name: warehouses.name,
            zone_name: zones.name,
        })
        .from(assets)
        .leftJoin(assetFamilies, eq(assets.family_id, assetFamilies.id))
        .leftJoin(companies, eq(assets.company_id, companies.id))
        .leftJoin(brands, eq(assets.brand_id, brands.id))
        .leftJoin(assetCategories, eq(assetFamilies.category_id, assetCategories.id))
        .leftJoin(teams, eq(assets.team_id, teams.id))
        .leftJoin(warehouses, eq(assets.warehouse_id, warehouses.id))
        .leftJoin(zones, eq(assets.zone_id, zones.id))
        .leftJoin(users, eq(assets.last_scanned_by, users.id))
        .where(and(...conditions))
        .orderBy(asc(companies.name), asc(assetFamilies.name), asc(assets.name));

    const companyName = dbRows.find((r) => r.company_name)?.company_name ?? null;
    console.log(
        `[catalog] ${dbRows.length} asset(s) matched${companyName ? ` — company: ${companyName}` : ""}`
    );

    const rows: AssetCatalogRow[] = dbRows.map((r) => {
        const dims = r.dimensions_asset ?? r.dimensions_family;
        return {
            asset_id: r.asset_id,
            asset_name: r.asset_name,
            qr_code: r.qr_code,
            family_id: r.family_id ?? null,
            family_name: r.family_name ?? null,
            company_item_code: r.company_item_code ?? null,
            description: r.description ?? null,
            company_name: r.company_name ?? null,
            brand_name: r.brand_name ?? null,
            category_name: r.category_name ?? null,
            team_name: r.team_name ?? null,
            stock_mode: r.stock_mode ?? null,
            tracking_method: r.tracking_method,
            total_quantity: r.total_quantity,
            available_quantity: r.available_quantity,
            low_stock_threshold: r.low_stock_threshold ?? null,
            condition: r.condition,
            status: r.status,
            condition_notes: r.condition_notes ?? null,
            refurb_days_estimate: r.refurb_days_estimate ?? null,
            packaging: r.packaging_asset ?? r.packaging_family ?? null,
            weight_per_unit: r.weight_per_unit_asset ?? r.weight_per_unit_family ?? null,
            volume_per_unit: r.volume_per_unit_asset ?? r.volume_per_unit_family ?? null,
            dimensions_length: readDim(dims, "length"),
            dimensions_width: readDim(dims, "width"),
            dimensions_height: readDim(dims, "height"),
            handling_tags:
                r.handling_tags_asset && r.handling_tags_asset.length > 0
                    ? r.handling_tags_asset
                    : (r.handling_tags_family ?? []),
            warehouse_name: r.warehouse_name ?? null,
            zone_name: r.zone_name ?? null,
            last_scanned_at: r.last_scanned_at ?? null,
            last_scanned_by_name: r.last_scanned_by_name ?? null,
            created_at: r.created_at,
            primary_image_url: resolveImageUrl(r),
        };
    });

    const datestamp = new Date().toISOString().slice(0, 10);
    const safeCompany = (companyName ?? "all").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
    const defaultName = `asset-catalog-${safeCompany}-${datestamp}.${includePhotos ? "xlsx" : "csv"}`;
    const outPath = outArg ?? path.join(process.cwd(), defaultName);

    if (includePhotos) {
        console.log(
            `[catalog] fetching images (bounded concurrency) — this can take a while for large sets...`
        );
        const buffer = await generateAssetCatalogXlsx(rows, {
            includePhotos: true,
            companyName,
        });
        fs.writeFileSync(outPath, buffer);
    } else {
        const csvRows = generateAssetCatalogCsvRows(rows);
        const csv = Papa.unparse(csvRows);
        fs.writeFileSync(outPath, csv, "utf-8");
    }

    console.log(`[catalog] wrote ${outPath}`);
}

main()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error("[catalog] failed:", error);
        try {
            await pool.end();
        } catch {
            // already closed / never opened — ignore
        }
        process.exit(1);
    });
