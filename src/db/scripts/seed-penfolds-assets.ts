/**
 * Penfolds asset import — post-squash model.
 *
 * Purpose-built for the Penfolds tenant. Borrows the proven primitives from
 * seed-pr-assets.ts (S3 upload, dry-run, APP_ENV gate, external-key idempotency,
 * post-squash insert shape) but handles what Penfolds needs and PR's script did
 * not: POOLED assets, the asset-GROUP path, zone/team creation, and reading a
 * lean NDJSON bundle instead of the PR doc/collection bundle.
 *
 * Usage:
 *   APP_ENV=staging bun run src/db/scripts/seed-penfolds-assets.ts --bundle <dir> --dry-run
 *   APP_ENV=staging bun run src/db/scripts/seed-penfolds-assets.ts --bundle <dir>
 *   APP_ENV=staging bun run src/db/scripts/seed-penfolds-assets.ts --bundle <dir> --skip-photos
 *
 * Bundle dir (from emit-penfolds-ndjson.py):
 *   <dir>/penfolds-assets.ndjson
 *   <dir>/photos/<key>.<ext>
 *   <dir>/manifest.json
 */

import { createInterface } from "readline";
import { createReadStream, existsSync, readFileSync } from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";

import { assertAppEnv } from "../safety/guards";
import { db } from "../../db";
import * as schema from "../../db/schema";
import { qrCodeGenerator } from "../../app/utils/qr-code-generator";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

assertAppEnv(["staging", "production"]);

// ---------------------------------------------------------------------------
// Fixed Penfolds scaffolding (confirmed against prod on 2026-07-01)
// ---------------------------------------------------------------------------
const PLATFORM_ID = "852e6d14-cd3e-4a78-893b-b6ea7c91dead";
const COMPANY_ID = "380126dc-9d1c-4283-b717-f8bc10ef41ef";
const DIC_WAREHOUSE_ID = "c34290d7-0526-4117-8446-33bc36295ab7";
const ZONE_NAME = "N/A";
const BRAND_NAME = "Penfolds";
const TEAM_NAMES = ["Local", "GTR"];

// ---------------------------------------------------------------------------
// Args + S3
// ---------------------------------------------------------------------------
const argOf = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const isDryRun = process.argv.includes("--dry-run");
const skipPhotos = process.argv.includes("--skip-photos");
const BUNDLE_DIR = path.resolve(argOf("bundle") ?? "");

const S3_BUCKET = process.env.AWS_BUCKET_NAME!;
const S3_REGION = process.env.AWS_REGION!;
const S3_PREFIX = "assets/penfolds-import";
const s3 = new S3Client({
    region: S3_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

// external-key marker embedded in description for idempotent re-runs
const KEY_MARKER = (key: string) => `[penfoldsKey:${key}]`;
const KEY_RE = /\[penfoldsKey:([^\]]+)\]/;

// ---------------------------------------------------------------------------
// Types (mirror the NDJSON emitted by emit-penfolds-ndjson.py)
// ---------------------------------------------------------------------------
interface AssetRow {
    key: string;
    name: string;
    brand: string;
    category: string;
    stock_mode: "POOLED" | "SERIALIZED";
    quantity: number;
    condition: "GREEN" | "ORANGE" | "RED";
    team: string | null;
    dimensions: { length: number | null; width: number | null; height: number | null } | null;
    dim_note: string;
    group: { group_key: string; group_name: string; unit_index: number; unit_count: number } | null;
    photo: string | null;
    source_row: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function readNdjson(filePath: string): Promise<AssetRow[]> {
    const rows: AssetRow[] = [];
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
        const t = line.trim();
        if (t) rows.push(JSON.parse(t));
    }
    return rows;
}

async function s3KeyExists(key: string): Promise<boolean> {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        return true;
    } catch {
        return false;
    }
}

const CONTENT_TYPE: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
};

/** Upload one photo (full-res original) → return public URL, or null if no file. */
async function uploadPhoto(photo: string | null): Promise<string | null> {
    if (!photo) return null;
    const local = path.join(BUNDLE_DIR, "photos", photo);
    if (!existsSync(local)) return null;
    const ext = (photo.split(".").pop() || "png").toLowerCase();
    const key = `${S3_PREFIX}/${photo}`;
    const url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
    if (isDryRun || skipPhotos) return url;
    if (await s3KeyExists(key)) return url;
    await s3.send(
        new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: readFileSync(local),
            ContentType: CONTENT_TYPE[ext] ?? "image/png",
        })
    );
    return url;
}

/** cm dims → volume in m³ (per unit). 0 when any dim missing. */
function computeVolume(dims: AssetRow["dimensions"]): string {
    if (!dims || dims.length == null || dims.width == null || dims.height == null) return "0.000";
    const m3 = (dims.length / 100) * (dims.width / 100) * (dims.height / 100);
    return m3.toFixed(3);
}

function dimsJson(dims: AssetRow["dimensions"], note: string) {
    const out: Record<string, unknown> = {};
    if (dims?.length != null) out.length = dims.length;
    if (dims?.width != null) out.width = dims.width;
    if (dims?.height != null) out.height = dims.height;
    if (note) out.note = note;
    return out;
}

const log = (m: string) => console.log(m);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    log(
        `\n🍷 Penfolds Asset Import ${isDryRun ? "[DRY RUN]" : "[LIVE]"}${skipPhotos ? " [skip-photos]" : ""}\n`
    );

    const ndjsonPath = path.join(BUNDLE_DIR, "penfolds-assets.ndjson");
    if (!existsSync(ndjsonPath)) {
        console.error(`❌ NDJSON not found: ${ndjsonPath}`);
        process.exit(1);
    }
    const rows = await readNdjson(ndjsonPath);
    log(`📄 ${rows.length} asset rows in bundle`);

    // --- Verify company + warehouse exist (created by tenant bootstrap / refresh) ---
    const [company] = await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(eq(schema.companies.id, COMPANY_ID))
        .limit(1);
    if (!company) {
        console.error(
            `❌ Penfolds company ${COMPANY_ID} not found on this DB. (Refresh staging from prod first.)`
        );
        process.exit(1);
    }
    const [warehouse] = await db
        .select({ id: schema.warehouses.id })
        .from(schema.warehouses)
        .where(eq(schema.warehouses.id, DIC_WAREHOUSE_ID))
        .limit(1);
    if (!warehouse) {
        console.error(`❌ DIC warehouse ${DIC_WAREHOUSE_ID} not found on this DB.`);
        process.exit(1);
    }

    // --- Zone (create if missing) ---
    let zoneId: string;
    const [zone] = await db
        .select({ id: schema.zones.id })
        .from(schema.zones)
        .where(
            and(
                eq(schema.zones.warehouse_id, DIC_WAREHOUSE_ID),
                eq(schema.zones.company_id, COMPANY_ID),
                eq(schema.zones.name, ZONE_NAME)
            )
        )
        .limit(1);
    if (zone) {
        zoneId = zone.id;
        log(`📍 Zone "${ZONE_NAME}" exists (${zoneId})`);
    } else if (isDryRun) {
        zoneId = "dry-run-zone";
        log(`📍 [DRY] would create zone "${ZONE_NAME}"`);
    } else {
        const [z] = await db
            .insert(schema.zones)
            .values({
                platform_id: PLATFORM_ID,
                warehouse_id: DIC_WAREHOUSE_ID,
                company_id: COMPANY_ID,
                name: ZONE_NAME,
                description: "Default placeholder zone (Penfolds import)",
            })
            .returning({ id: schema.zones.id });
        zoneId = z.id;
        log(`📍 Created zone "${ZONE_NAME}" (${zoneId})`);
    }

    // --- Brand (create if missing) ---
    let brandId: string;
    const [brand] = await db
        .select({ id: schema.brands.id })
        .from(schema.brands)
        .where(and(eq(schema.brands.company_id, COMPANY_ID), eq(schema.brands.name, BRAND_NAME)))
        .limit(1);
    if (brand) {
        brandId = brand.id;
        log(`🏷️  Brand "${BRAND_NAME}" exists (${brandId})`);
    } else if (isDryRun) {
        brandId = "dry-run-brand";
        log(`🏷️  [DRY] would create brand "${BRAND_NAME}"`);
    } else {
        const [b] = await db
            .insert(schema.brands)
            .values({
                platform_id: PLATFORM_ID,
                company_id: COMPANY_ID,
                name: BRAND_NAME,
                is_active: true,
            })
            .returning({ id: schema.brands.id });
        brandId = b.id;
        log(`🏷️  Created brand "${BRAND_NAME}" (${brandId})`);
    }

    // --- Teams (create if missing) ---
    const teamMap: Record<string, string> = {};
    for (const teamName of TEAM_NAMES) {
        const [t] = await db
            .select({ id: schema.teams.id })
            .from(schema.teams)
            .where(and(eq(schema.teams.company_id, COMPANY_ID), eq(schema.teams.name, teamName)))
            .limit(1);
        if (t) {
            teamMap[teamName] = t.id;
        } else if (isDryRun) {
            teamMap[teamName] = `dry-run-team-${teamName}`;
        } else {
            const [ins] = await db
                .insert(schema.teams)
                .values({
                    platform_id: PLATFORM_ID,
                    company_id: COMPANY_ID,
                    name: teamName,
                    description: `Penfolds ${teamName} team`,
                })
                .returning({ id: schema.teams.id });
            teamMap[teamName] = ins.id;
        }
    }
    log(`👥 Teams ready: ${Object.keys(teamMap).join(", ")}`);

    // --- Categories (resolve universal/company; create company-scoped if missing) ---
    const neededCats = Array.from(new Set(rows.map((r) => r.category)));
    const catMap: Record<string, string> = {};
    for (const catName of neededCats) {
        // universal (company_id NULL) OR company-scoped match by name
        const existing = await db
            .select({
                id: schema.assetCategories.id,
                company_id: schema.assetCategories.company_id,
            })
            .from(schema.assetCategories)
            .where(
                and(
                    eq(schema.assetCategories.platform_id, PLATFORM_ID),
                    eq(schema.assetCategories.name, catName)
                )
            );
        const hit = existing.find((c) => c.company_id === null) ?? existing[0];
        if (hit) {
            catMap[catName] = hit.id;
        } else if (isDryRun) {
            catMap[catName] = `dry-run-cat-${catName}`;
        } else {
            const [c] = await db
                .insert(schema.assetCategories)
                .values({
                    platform_id: PLATFORM_ID,
                    company_id: COMPANY_ID,
                    name: catName,
                    slug: catName
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    color: "#7B4B94",
                    is_active: true,
                })
                .returning({ id: schema.assetCategories.id });
            catMap[catName] = c.id;
        }
    }
    log(`🗂️  Categories ready: ${neededCats.length} (${neededCats.join(", ")})`);

    // --- Existing assets for idempotency (by penfoldsKey marker) ---
    const existingAssets = await db
        .select({ id: schema.assets.id, description: schema.assets.description })
        .from(schema.assets)
        .where(eq(schema.assets.company_id, COMPANY_ID));
    const existingByKey = new Map<string, string>();
    for (const a of existingAssets) {
        const m = (a.description || "").match(KEY_RE);
        if (m?.[1]) existingByKey.set(m[1], a.id);
    }

    // --- Assign a shared group_id per group_key (stable within this run) ---
    const groupIdByKey = new Map<string, string>();
    for (const r of rows) {
        if (r.group && !groupIdByKey.has(r.group.group_key)) {
            groupIdByKey.set(r.group.group_key, randomUUID());
        }
    }

    // --- Upload photos (dedup by photo filename; group siblings copied per-unit so unique) ---
    log(`📸 Uploading photos…`);
    const urlByPhoto = new Map<string, string | null>();
    let uploaded = 0,
        missing = 0;
    for (const r of rows) {
        if (!r.photo || urlByPhoto.has(r.photo)) continue;
        const url = await uploadPhoto(r.photo);
        urlByPhoto.set(r.photo, url);
        if (url) uploaded++;
        else missing++;
    }
    log(`   ${uploaded} uploaded/known, ${missing} missing-local`);

    // --- Insert / update assets ---
    log(`🍷 Importing assets…`);
    let created = 0,
        updated = 0,
        errors = 0;
    for (const r of rows) {
        try {
            const url = r.photo ? (urlByPhoto.get(r.photo) ?? null) : null;
            const images = url ? [{ url, source: "CLIENT" as const }] : [];
            const onDisplay = url ?? null;
            const teamId = r.team ? (teamMap[r.team] ?? null) : null;
            const groupId = r.group ? groupIdByKey.get(r.group.group_key)! : null;
            const refurb = r.condition === "RED" ? 7 : r.condition === "ORANGE" ? 3 : null;
            const description = KEY_MARKER(r.key);

            if (isDryRun) {
                const verb = existingByKey.has(r.key) ? "update" : "insert";
                log(
                    `  [DRY] ${verb} "${r.name}" — ${r.stock_mode} qty=${r.quantity} team=${r.team ?? "-"} cat=${r.category}${groupId ? " [group]" : ""}`
                );
                continue;
            }

            const common = {
                name: r.name,
                description,
                category: r.category,
                images,
                on_display_image: onDisplay,
                brand_id: brandId,
                team_id: teamId,
                condition: r.condition,
                refurb_days_estimate: refurb,
                weight_per_unit: "0.00",
                volume_per_unit: computeVolume(r.dimensions),
                dimensions: dimsJson(r.dimensions, r.dim_note),
                group_id: groupId,
                group_name: r.group ? r.group.group_name : null,
            };

            const existingId = existingByKey.get(r.key);
            if (existingId) {
                await db.update(schema.assets).set(common).where(eq(schema.assets.id, existingId));
                updated++;
            } else {
                const qr = await qrCodeGenerator(COMPANY_ID);
                await db.insert(schema.assets).values({
                    platform_id: PLATFORM_ID,
                    company_id: COMPANY_ID,
                    warehouse_id: DIC_WAREHOUSE_ID,
                    zone_id: zoneId,
                    stock_mode: r.stock_mode,
                    total_quantity: r.quantity,
                    available_quantity: r.quantity,
                    qr_code: qr,
                    status: "AVAILABLE",
                    ...common,
                });
                created++;
            }
        } catch (err: any) {
            console.error(`  ❌ "${r.name}" (${r.key}): ${err.message}`);
            errors++;
        }
    }

    log(`\n✓ Assets: ${created} created, ${updated} updated, ${errors} errors`);
    if (isDryRun) log(`(dry-run — no writes performed)`);
    process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error("❌ Penfolds import failed:", e instanceof Error ? e.message : e);
    process.exit(1);
});
