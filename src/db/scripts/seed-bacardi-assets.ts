/**
 * BACARDI ASSETS IMPORT
 *
 * One-shot tenant onboarding import. Reads a cleaning-tool bundle:
 *   /home/mshari696/apps/kadence/redbull-asset-alignment-task/output/bacardi-enrichment-2026-04-20/
 *     ├── review.xlsx              17 cols, 410 rows (1 header + 409 data)
 *     ├── images/                  444 PNGs referenced by image_filename column
 *     └── classifications-by-sheetrow.json
 *
 * Run flow:
 *   # 1. Extract — XLSX → NDJSON. Re-run after every source regen.
 *   python3 src/db/scripts/seed-bacardi-extract.py
 *
 *   # 2. Pre-flight — read-only validation
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts \
 *       src/db/scripts/seed-bacardi-assets.ts --phase=preflight
 *
 *   # 3. Setup — creates UAQ-C warehouse, Bacardi N/A zone, missing categories.
 *   #    Single transaction. SELECT-then-INSERT (idempotent). Always asks
 *   #    for confirmation unless --yes.
 *   APP_ENV=staging bun ... --phase=setup
 *
 *   # 4. Images — upload all referenced PNGs to S3. Idempotent (HEAD-then-PUT).
 *   APP_ENV=staging bun ... --phase=images
 *
 *   # 5. DB — single transaction: brands → families → assets. Reads the URL
 *   #    map produced by --phase=images. Manifest written after commit.
 *   APP_ENV=staging bun ... --phase=db
 *
 *   # Or, all of the above end-to-end (after Phase 0 is in place):
 *   APP_ENV=staging bun ... --phase=all
 *
 * RECOVERY: psql "$DATABASE_URL" -f src/db/scripts/cleanup-bacardi-import.sql
 *   wipes everything Phases 0 + B + C created. Safe because Bacardi has no
 *   prior data — wipe + rerun is the recovery story.
 *
 * BLAST RADIUS: All writes scoped to either the Bacardi company UUID or the
 *   Kadence platform UUID. No UPDATE/DELETE on existing rows. The 2 new
 *   asset_categories are platform-wide (acceptable — they're new vocabulary
 *   additions, reusable by Pernod/RB later).
 *
 * Both APP_ENV=staging and APP_ENV=production are accepted. Always run
 * staging first; prod only after staging verified clean.
 */

import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import readline from "node:readline";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, pool } from "../index";
import * as schema from "../schema";
import { assertAppEnv } from "../safety/guards";
import { getAppEnv } from "../../app/constants/app-env";

assertAppEnv(["staging", "production"]);

// ---------------------------------------------------------------------------
// Constants — UUIDs verified against prod DB pre-write.
// ---------------------------------------------------------------------------

const PLATFORM_ID = "852e6d14-cd3e-4a78-893b-b6ea7c91dead"; // Kadence platform
const COMPANY_ID = "8da36306-052b-4e98-84e9-6ab09acdbb69"; // Bacardi company

const SOURCE_DIR =
    "/home/mshari696/apps/kadence/redbull-asset-alignment-task/output/bacardi-enrichment-2026-04-20";
const IMAGES_DIR = join(SOURCE_DIR, "images");

const NDJSON_PATH = "/tmp/kadence-bacardi-import/inventory.ndjson";
const CHECKSUM_PATH = "/tmp/kadence-bacardi-import/source-checksum.json";
const IMAGE_URLS_PATH = "/tmp/kadence-bacardi-import/image-urls.json";

const WAREHOUSE_NAME = "UAQ - C";
const ZONE_NAME = "N/A";
const WAREHOUSE_DEFAULTS = {
    country: "UAE",
    city: "Umm Al Quwain",
    // Placeholder per onboarding decision — admin can refine via UI later.
    address: "Umm Al Quwain Industrial Area, UAQ, UAE",
};

// Categories to create in Phase 0 are derived dynamically from the
// inventory NDJSON: anything the data references that's not already on
// the platform. Slugs are auto-generated; color defaults to a neutral
// slate (admin can recolor later).
const DEFAULT_CATEGORY_COLOR = "#71717A";
const slugify = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const S3_PREFIX = `assets/bacardi-import/${COMPANY_ID}/images`;
const ASSET_INSERT_BATCH = 500; // 500 × ~16 cols ≈ 8k params (PG limit 65k)
const IMAGE_UPLOAD_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InventoryRow = {
    family_name: string | null;
    asset_name: string;
    original_name: string | null;
    brand: string;
    image_filename: string | null;
    category: string;
    qty: number;
    type: "SERIALIZED" | "POOLED";
    fy: string | null;
    sheet: string | null;
    row: number;
    comments: string | null;
};

type SourceChecksum = {
    xlsx_path: string;
    xlsx_sha256: string;
    xlsx_size_bytes: number;
    inventory_row_count: number;
    excluded_row_count: number;
    skipped_header_junk: number;
    skipped_empty_asset_name: number;
    extracted_at: string;
};

type ImageUrlMap = Record<string, string>; // filename → public URL

type PreflightResult = {
    platform: { id: string; name: string };
    company: { id: string; name: string };
    warehouse: { id: string; name: string } | null;
    zone: { id: string; name: string } | null;
    inventory: InventoryRow[];
    checksum: SourceChecksum;
    categoriesByNameLc: Map<string, { id: string; name: string }>;
    missingCategories: string[];
    presentCategories: string[];
    uniqueCategories: Set<string>;
    byType: Record<string, number>;
    byBrand: Record<string, number>;
    families: Set<string>;
    totalAssetsExpected: number;
    imageReferences: number;
    bacardiState: { brands: number; families: number; assets: number };
    blockers: string[];
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
    const eq = argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.slice(name.length + 3);
    const idx = argv.indexOf(`--${name}`);
    return idx >= 0 ? argv[idx + 1] : undefined;
};
const hasFlag = (name: string) => argv.includes(`--${name}`);

const phase = getArg("phase") ?? "preflight";
const force = hasFlag("force");
const yes = hasFlag("yes");
const dryRun = hasFlag("dry-run");
const skipImageUpload = hasFlag("skip-image-upload");
const forceUpload = hasFlag("force-upload");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const banner = (title: string) => {
    const bar = "─".repeat(72);
    console.log(`\n${bar}\n  ${title}\n${bar}`);
};

const ask = async (question: string): Promise<string> => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    rl.close();
    return answer.trim();
};

const askYesNo = async (question: string): Promise<boolean> => {
    if (yes) {
        console.log(`${question} [auto-yes via --yes]`);
        return true;
    }
    const a = (await ask(`${question} [y/N] `)).toLowerCase();
    return a === "y" || a === "yes";
};

const readChecksum = (): SourceChecksum => {
    if (!existsSync(CHECKSUM_PATH)) {
        throw new Error(
            `Source checksum not found at ${CHECKSUM_PATH}\n` +
                "  → Run extractor first: python3 src/db/scripts/seed-bacardi-extract.py"
        );
    }
    return JSON.parse(readFileSync(CHECKSUM_PATH, "utf8"));
};

const readInventory = (): InventoryRow[] => {
    if (!existsSync(NDJSON_PATH)) {
        throw new Error(
            `Inventory NDJSON not found at ${NDJSON_PATH}\n` +
                "  → Run extractor first: python3 src/db/scripts/seed-bacardi-extract.py"
        );
    }
    return readFileSync(NDJSON_PATH, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as InventoryRow);
};

const readImageUrlMap = (): ImageUrlMap => {
    if (!existsSync(IMAGE_URLS_PATH)) {
        throw new Error(
            `Image URL map not found at ${IMAGE_URLS_PATH}\n` +
                "  → Run --phase=images first to populate it."
        );
    }
    return JSON.parse(readFileSync(IMAGE_URLS_PATH, "utf8"));
};

// ---------------------------------------------------------------------------
// Asset measurement synthesis (deterministic from name).
// Direct port of the PR import's algorithm — Bacardi source has zero
// physical attributes, same as PR did. Two assets with the same family
// name get identical measurements (correct: physically identical units).
// ---------------------------------------------------------------------------

type SizingProfile = {
    key: string;
    lengthRange: [number, number];
    widthRange: [number, number];
    heightRange: [number, number];
    weightRange: [number, number];
};

const SIZING_PROFILES: SizingProfile[] = [
    {
        key: "large_installation",
        lengthRange: [180, 420],
        widthRange: [50, 140],
        heightRange: [180, 320],
        weightRange: [80, 320],
    },
    {
        key: "bar_or_counter",
        lengthRange: [120, 300],
        widthRange: [50, 90],
        heightRange: [90, 120],
        weightRange: [35, 140],
    },
    {
        key: "table_display",
        lengthRange: [60, 220],
        widthRange: [60, 120],
        heightRange: [45, 110],
        weightRange: [8, 60],
    },
    {
        key: "chair_stool",
        lengthRange: [35, 60],
        widthRange: [35, 60],
        heightRange: [45, 120],
        weightRange: [4, 18],
    },
    {
        key: "shelving_display",
        lengthRange: [60, 180],
        widthRange: [30, 60],
        heightRange: [120, 240],
        weightRange: [18, 90],
    },
    {
        key: "fridge_cooler",
        lengthRange: [55, 120],
        widthRange: [55, 90],
        heightRange: [85, 220],
        weightRange: [35, 140],
    },
    {
        key: "sign_lighting",
        lengthRange: [40, 180],
        widthRange: [8, 30],
        heightRange: [40, 160],
        weightRange: [3, 28],
    },
    {
        key: "plinth_podium",
        lengthRange: [30, 80],
        widthRange: [30, 80],
        heightRange: [80, 140],
        weightRange: [10, 45],
    },
    {
        key: "small_accessory",
        lengthRange: [15, 80],
        widthRange: [15, 60],
        heightRange: [5, 60],
        weightRange: [1, 20],
    },
    {
        key: "default",
        lengthRange: [50, 180],
        widthRange: [30, 90],
        heightRange: [40, 180],
        weightRange: [6, 75],
    },
];

function inferSizingProfile(title: string): SizingProfile {
    const haystack = title.toLowerCase();
    if (
        /(backdrop|wall|arch|frame|fascia|totem|booth|stand|activation|display unit|display wall|installation|structure|gantry|portal|kiosk)/.test(
            haystack
        )
    )
        return SIZING_PROFILES[0];
    if (/(bar|counter|station|serve station|sampling unit)/.test(haystack))
        return SIZING_PROFILES[1];
    if (/(table|desk|console|display table)/.test(haystack)) return SIZING_PROFILES[2];
    if (/(chair|stool|bench|seat|seating)/.test(haystack)) return SIZING_PROFILES[3];
    if (/(shelf|shelving|rack|cabinet|bookcase|display shelf)/.test(haystack))
        return SIZING_PROFILES[4];
    if (/(fridge|cooler|freezer|ice box|chiller)/.test(haystack)) return SIZING_PROFILES[5];
    if (/(sign|neon|lightbox|light box|lamp|lighting|led)/.test(haystack))
        return SIZING_PROFILES[6];
    if (/(plinth|podium|pedestal|cube)/.test(haystack)) return SIZING_PROFILES[7];
    if (
        /(bucket|tray|crate|menu|props|prop|smallware|accessory|cap|t shirt|tshirt|bag|tokens|pin|diary|book)/.test(
            haystack
        )
    )
        return SIZING_PROFILES[8];
    return SIZING_PROFILES[9];
}

function deterministic01(seed: string, salt: string): number {
    const digest = createHash("sha256").update(`${seed}:${salt}`).digest("hex").slice(0, 8);
    return parseInt(digest, 16) / 0xffffffff;
}

function pickFromRange(
    seed: string,
    salt: string,
    [min, max]: [number, number],
    precision = 0
): number {
    const value = min + deterministic01(seed, salt) * (max - min);
    const f = 10 ** precision;
    return Math.round(value * f) / f;
}

function deriveMeasurements(seed: string, title: string) {
    const profile = inferSizingProfile(title);
    const length = pickFromRange(seed, "length", profile.lengthRange);
    const width = pickFromRange(seed, "width", profile.widthRange);
    const height = pickFromRange(seed, "height", profile.heightRange);
    const weight = pickFromRange(seed, "weight", profile.weightRange, 2);
    const volume = Number(((length * width * height) / 1_000_000).toFixed(3));
    return {
        dimensions: { length, width, height },
        weightPerUnit: weight.toFixed(2),
        volumePerUnit: volume.toFixed(3),
        sizingProfile: profile.key,
    };
}

// ---------------------------------------------------------------------------
// QR code generation (collision-checked once before insert).
// 4 bytes random = 4B space; with 1.7k codes, birthday collision odds ~1/2.4M.
// We additionally guard via a single SELECT against existing DB qr_codes.
// ---------------------------------------------------------------------------

function generateQrCode(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = randomBytes(4).toString("hex").toUpperCase();
    return `ASSET-BAC-${date}-${rand}`;
}

// ---------------------------------------------------------------------------
// S3 client (lazy-initialized; only Phase B + C touch it)
// ---------------------------------------------------------------------------

let _s3: S3Client | null = null;
function s3Client(): S3Client {
    if (_s3) return _s3;
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!region || !accessKeyId || !secretAccessKey) {
        throw new Error(
            "AWS credentials missing (AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)"
        );
    }
    _s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
    return _s3;
}

const S3_BUCKET = () => {
    const b = process.env.AWS_BUCKET_NAME;
    if (!b) throw new Error("AWS_BUCKET_NAME is missing");
    return b;
};

const s3PublicUrl = (key: string) =>
    `https://${S3_BUCKET()}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

async function s3KeyExists(key: string): Promise<boolean> {
    try {
        await s3Client().send(new HeadObjectCommand({ Bucket: S3_BUCKET(), Key: key }));
        return true;
    } catch {
        return false;
    }
}

async function s3Put(key: string, body: Buffer, contentType: string): Promise<void> {
    await s3Client().send(
        new PutObjectCommand({
            Bucket: S3_BUCKET(),
            Key: key,
            Body: body,
            ContentType: contentType,
        })
    );
}

async function withConcurrency<T, R>(
    items: T[],
    fn: (item: T, idx: number) => Promise<R>,
    n: number
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    async function worker() {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return results;
}

// ---------------------------------------------------------------------------
// Pre-flight check (read-only, returns result for reuse by other phases)
// ---------------------------------------------------------------------------

async function checkPreflight(): Promise<PreflightResult> {
    const checksum = readChecksum();
    const inventory = readInventory();
    if (inventory.length !== checksum.inventory_row_count) {
        throw new Error(
            `NDJSON row count (${inventory.length}) != checksum (${checksum.inventory_row_count}). ` +
                "Re-run extractor."
        );
    }

    const platform = await db.query.platforms.findFirst({
        where: eq(schema.platforms.id, PLATFORM_ID),
    });
    if (!platform) throw new Error(`Platform ${PLATFORM_ID} not found on ${getAppEnv()} DB`);

    const company = await db.query.companies.findFirst({
        where: eq(schema.companies.id, COMPANY_ID),
    });
    if (!company) throw new Error(`Bacardi company ${COMPANY_ID} not found on ${getAppEnv()} DB`);

    const warehouse = await db.query.warehouses.findFirst({
        where: and(
            eq(schema.warehouses.platform_id, PLATFORM_ID),
            eq(schema.warehouses.name, WAREHOUSE_NAME)
        ),
    });

    const zone = warehouse
        ? await db.query.zones.findFirst({
              where: and(
                  eq(schema.zones.warehouse_id, warehouse.id),
                  eq(schema.zones.company_id, COMPANY_ID),
                  eq(schema.zones.name, ZONE_NAME)
              ),
          })
        : null;

    const allCategories = await db.query.assetCategories.findMany({
        where: eq(schema.assetCategories.platform_id, PLATFORM_ID),
    });
    const categoriesByNameLc = new Map(
        allCategories.map((c) => [c.name.toLowerCase(), { id: c.id, name: c.name }])
    );

    const uniqueCategories = new Set(inventory.map((r) => r.category));
    const missingCategories: string[] = [];
    const presentCategories: string[] = [];
    for (const cat of uniqueCategories) {
        if (categoriesByNameLc.has(cat.toLowerCase())) presentCategories.push(cat);
        else missingCategories.push(cat);
    }

    const byType: Record<string, number> = {};
    const byBrand: Record<string, number> = {};
    const families = new Set<string>();
    let totalAssetsExpected = 0;
    let imageReferences = 0;
    for (const r of inventory) {
        byType[r.type] = (byType[r.type] ?? 0) + 1;
        byBrand[r.brand] = (byBrand[r.brand] ?? 0) + 1;
        if (r.family_name) families.add(r.family_name);
        if (r.image_filename && r.image_filename !== "image_filename") imageReferences++;
        totalAssetsExpected += r.type === "SERIALIZED" ? r.qty : 1;
    }

    const [bacardiBrandCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.brands)
        .where(eq(schema.brands.company_id, COMPANY_ID));
    const [bacardiFamilyCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.assetFamilies)
        .where(
            and(
                eq(schema.assetFamilies.company_id, COMPANY_ID),
                isNull(schema.assetFamilies.deleted_at)
            )
        );
    const [bacardiAssetCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.assets)
        .where(and(eq(schema.assets.company_id, COMPANY_ID), isNull(schema.assets.deleted_at)));

    const bacardiState = {
        brands: Number(bacardiBrandCount.n),
        families: Number(bacardiFamilyCount.n),
        assets: Number(bacardiAssetCount.n),
    };

    const blockers: string[] = [];
    if (!warehouse) blockers.push(`Warehouse "${WAREHOUSE_NAME}" missing`);
    if (!zone)
        blockers.push(`Zone "${ZONE_NAME}" (Bacardi-scoped under "${WAREHOUSE_NAME}") missing`);
    if (missingCategories.length) blockers.push(`${missingCategories.length} categories missing`);
    if (bacardiState.brands + bacardiState.families + bacardiState.assets > 0 && !force) {
        blockers.push(
            "Bacardi already has data — run cleanup-bacardi-import.sql or pass --force to override"
        );
    }

    return {
        platform: { id: platform.id, name: platform.name },
        company: { id: company.id, name: company.name },
        warehouse: warehouse ? { id: warehouse.id, name: warehouse.name } : null,
        zone: zone ? { id: zone.id, name: zone.name } : null,
        inventory,
        checksum,
        categoriesByNameLc,
        missingCategories,
        presentCategories,
        uniqueCategories,
        byType,
        byBrand,
        families,
        totalAssetsExpected,
        imageReferences,
        bacardiState,
        blockers,
    };
}

function reportPreflight(r: PreflightResult) {
    banner("FINDINGS");
    console.log(`Platform                 : ${r.platform.name} (${r.platform.id})`);
    console.log(`Company                  : ${r.company.name} (${r.company.id})`);
    console.log(
        `Warehouse "${WAREHOUSE_NAME}"        : ${r.warehouse ? `✓ ${r.warehouse.id}` : "✗ MISSING — run --phase=setup"}`
    );
    console.log(
        `Zone "${ZONE_NAME}" (Bacardi-scoped)   : ${r.zone ? `✓ ${r.zone.id}` : "✗ MISSING — run --phase=setup"}`
    );
    console.log();
    console.log(`Source XLSX              : ${r.checksum.xlsx_path}`);
    console.log(`SHA256                   : ${r.checksum.xlsx_sha256}`);
    console.log(
        `Size                     : ${(r.checksum.xlsx_size_bytes / 1024 / 1024).toFixed(1)} MB`
    );
    console.log(`Inventory rows           : ${r.inventory.length}`);
    console.log(
        `Skipped during extract   : ${r.checksum.skipped_header_junk} header-junk, ${r.checksum.skipped_empty_asset_name} empty asset_name`
    );
    console.log(
        `Excluded sheet           : ${r.checksum.excluded_row_count} (NOT imported — depleted/disposed)`
    );
    console.log();
    console.log("By type:");
    for (const [t, n] of Object.entries(r.byType).sort()) console.log(`  ${t.padEnd(12)} ${n}`);
    console.log(`\nUnique families          : ${r.families.size}`);
    console.log(`Unique brands            : ${Object.keys(r.byBrand).length}`);
    for (const [b, n] of Object.entries(r.byBrand).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${b.padEnd(20)} ${n}`);
    }
    console.log(`\nUnique categories        : ${r.uniqueCategories.size}`);
    console.log(`  ✓ already on platform  : ${r.presentCategories.length}`);
    if (r.missingCategories.length) {
        console.log(`  ✗ missing (will create): ${r.missingCategories.length}`);
        for (const c of r.missingCategories) console.log(`    - ${c}`);
    } else {
        console.log("  ✓ all resolved");
    }
    console.log(`\nImage references         : ${r.imageReferences} / ${r.inventory.length}`);
    console.log("\nExpected new rows in Kadence:");
    console.log(`  brands         : ${Object.keys(r.byBrand).length}`);
    console.log(`  asset_families : ${r.families.size}`);
    console.log(`  assets         : ${r.totalAssetsExpected}`);
    console.log("\nCurrent Bacardi state on this DB:");
    console.log(`  brands         : ${r.bacardiState.brands}`);
    console.log(`  asset_families : ${r.bacardiState.families}`);
    console.log(`  assets         : ${r.bacardiState.assets}`);

    banner("VERDICT");
    if (r.blockers.length === 0) {
        console.log("✓ All checks passed. Ready for next phases (B images → C db).");
    } else {
        console.log(`✗ ${r.blockers.length} blocking issue(s):`);
        for (const f of r.blockers) console.log(`  - ${f}`);
    }
}

// ---------------------------------------------------------------------------
// PHASE A — pre-flight (read-only)
// ---------------------------------------------------------------------------

async function runPreflight() {
    banner(`PRE-FLIGHT  —  env: ${getAppEnv()}`);
    const result = await checkPreflight();
    reportPreflight(result);
    if (result.blockers.length > 0) {
        console.log("\nFor missing setup items, run:");
        console.log(`  APP_ENV=${getAppEnv()} bun --preload ./src/bootstrap/env-preload.ts \\`);
        console.log("    src/db/scripts/seed-bacardi-assets.ts --phase=setup");
        process.exitCode = 1;
    }
}

// ---------------------------------------------------------------------------
// PHASE 0 — setup (creates UAQ-C, Bacardi N/A zone, missing categories)
// ---------------------------------------------------------------------------

async function runSetup() {
    banner(`SETUP  —  env: ${getAppEnv()}`);

    // Derive what categories the new data needs vs. what's already on the platform.
    const inventory = readInventory();
    const allCategories = await db.query.assetCategories.findMany({
        where: eq(schema.assetCategories.platform_id, PLATFORM_ID),
    });
    const categoriesByNameLc = new Map(allCategories.map((c) => [c.name.toLowerCase(), c]));
    const neededCategoryNames = Array.from(new Set(inventory.map((r) => r.category))).sort();
    const categoriesToCreate = neededCategoryNames
        .filter((name) => !categoriesByNameLc.has(name.toLowerCase()))
        .map((name) => ({ name, slug: slugify(name), color: DEFAULT_CATEGORY_COLOR }));

    const existingWarehouse = await db.query.warehouses.findFirst({
        where: and(
            eq(schema.warehouses.platform_id, PLATFORM_ID),
            eq(schema.warehouses.name, WAREHOUSE_NAME)
        ),
    });

    const existingZone = existingWarehouse
        ? await db.query.zones.findFirst({
              where: and(
                  eq(schema.zones.warehouse_id, existingWarehouse.id),
                  eq(schema.zones.company_id, COMPANY_ID),
                  eq(schema.zones.name, ZONE_NAME)
              ),
          })
        : null;

    console.log("Plan:");
    if (existingWarehouse) {
        console.log(`  • SKIP (warehouse exists): ${WAREHOUSE_NAME} → ${existingWarehouse.id}`);
    } else {
        console.log(
            `  • CREATE warehouse: ${WAREHOUSE_NAME} (country=${WAREHOUSE_DEFAULTS.country}, city=${WAREHOUSE_DEFAULTS.city})`
        );
        console.log(`      address: ${WAREHOUSE_DEFAULTS.address}`);
    }
    if (existingZone) {
        console.log(`  • SKIP (zone exists): ${ZONE_NAME} → ${existingZone.id}`);
    } else {
        console.log(`  • CREATE zone: ${ZONE_NAME} (Bacardi-scoped, under ${WAREHOUSE_NAME})`);
    }
    if (categoriesToCreate.length === 0) {
        console.log("  • SKIP (categories): all data-needed categories already on platform");
    } else {
        for (const c of categoriesToCreate) {
            console.log(
                `  • CREATE category (platform-wide): ${c.name} (slug=${c.slug}, color=${c.color})`
            );
        }
    }

    const willWrite = !existingWarehouse || !existingZone || categoriesToCreate.length > 0;
    if (!willWrite) {
        console.log("\n✓ Nothing to do.");
        return;
    }
    if (dryRun) {
        console.log("\n[--dry-run — no writes]");
        return;
    }

    console.log();
    if (!(await askYesNo("Apply these changes?"))) {
        console.log("Aborted.");
        return;
    }

    let warehouseId = existingWarehouse?.id ?? null;
    let zoneId = existingZone?.id ?? null;
    const createdCategories: { id: string; name: string }[] = [];

    await db.transaction(async (tx) => {
        if (!existingWarehouse) {
            const [created] = await tx
                .insert(schema.warehouses)
                .values({
                    platform_id: PLATFORM_ID,
                    name: WAREHOUSE_NAME,
                    country: WAREHOUSE_DEFAULTS.country,
                    city: WAREHOUSE_DEFAULTS.city,
                    address: WAREHOUSE_DEFAULTS.address,
                    is_active: true,
                })
                .returning({ id: schema.warehouses.id });
            warehouseId = created.id;
        }

        if (!existingZone) {
            if (!warehouseId) throw new Error("Internal: warehouseId unresolved");
            const [created] = await tx
                .insert(schema.zones)
                .values({
                    platform_id: PLATFORM_ID,
                    warehouse_id: warehouseId,
                    company_id: COMPANY_ID,
                    name: ZONE_NAME,
                    is_active: true,
                })
                .returning({ id: schema.zones.id });
            zoneId = created.id;
        }

        let nextSort = allCategories.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1;
        for (const c of categoriesToCreate) {
            const [created] = await tx
                .insert(schema.assetCategories)
                .values({
                    platform_id: PLATFORM_ID,
                    company_id: null,
                    name: c.name,
                    slug: c.slug,
                    color: c.color,
                    sort_order: nextSort++,
                    is_active: true,
                })
                .returning({ id: schema.assetCategories.id, name: schema.assetCategories.name });
            createdCategories.push(created);
        }
    });

    banner("SETUP COMPLETE");
    console.log(`Warehouse: ${warehouseId}`);
    console.log(`Zone     : ${zoneId}`);
    if (createdCategories.length) {
        console.log("Categories created:");
        for (const c of createdCategories) console.log(`  ${c.id}  ${c.name}`);
    } else {
        console.log("Categories: nothing new");
    }
    console.log("\nNext: re-run --phase=preflight to confirm all blockers cleared.");
}

// ---------------------------------------------------------------------------
// PHASE B — image upload to S3 (idempotent via HEAD-then-PUT)
// ---------------------------------------------------------------------------

async function runImages(pre?: PreflightResult) {
    banner(`IMAGES  —  env: ${getAppEnv()}`);

    const r = pre ?? (await checkPreflight());
    if (r.blockers.length > 0 && !force) {
        console.log("✗ Pre-flight has blockers; refusing to proceed:");
        for (const f of r.blockers) console.log(`  - ${f}`);
        console.log("\nFix blockers (run --phase=setup) or pass --force to override.");
        process.exitCode = 1;
        return;
    }

    if (skipImageUpload) {
        console.log("--skip-image-upload set — building URL map from filenames without S3 calls.");
    }
    if (!existsSync(IMAGES_DIR)) {
        throw new Error(`Images directory not found: ${IMAGES_DIR}`);
    }

    const filesOnDisk = new Set(readdirSync(IMAGES_DIR));
    const referencedFilenames = Array.from(
        new Set(
            r.inventory
                .map((row) => row.image_filename)
                .filter((f): f is string => Boolean(f) && f !== "image_filename")
        )
    );

    const missingOnDisk = referencedFilenames.filter((f) => !filesOnDisk.has(f));
    if (missingOnDisk.length > 0) {
        throw new Error(
            `${missingOnDisk.length} referenced filename(s) not on disk under ${IMAGES_DIR}. ` +
                `First few: ${missingOnDisk.slice(0, 5).join(", ")}`
        );
    }

    console.log(`Files on disk            : ${filesOnDisk.size}`);
    console.log(`Files referenced         : ${referencedFilenames.length}`);
    console.log(`S3 prefix                : s3://${S3_BUCKET()}/${S3_PREFIX}/`);

    const urlMap: ImageUrlMap = {};
    let uploaded = 0;
    let alreadyPresent = 0;
    let bytesUploaded = 0;

    if (dryRun) {
        for (const fn of referencedFilenames) {
            urlMap[fn] = s3PublicUrl(`${S3_PREFIX}/${fn}`);
        }
        console.log("\n[--dry-run — populated URL map without HEAD/PUT calls]");
        writeFileSync(IMAGE_URLS_PATH, JSON.stringify(urlMap, null, 2));
        console.log(
            `Wrote dry URL map        : ${IMAGE_URLS_PATH}  (${Object.keys(urlMap).length} entries)`
        );
        return;
    }

    if (skipImageUpload) {
        for (const fn of referencedFilenames) {
            urlMap[fn] = s3PublicUrl(`${S3_PREFIX}/${fn}`);
        }
        writeFileSync(IMAGE_URLS_PATH, JSON.stringify(urlMap, null, 2));
        console.log(`Wrote URL map (no S3 calls): ${IMAGE_URLS_PATH}`);
        return;
    }

    const startedAt = Date.now();
    let progress = 0;
    await withConcurrency(
        referencedFilenames,
        async (fn) => {
            const key = `${S3_PREFIX}/${fn}`;
            const url = s3PublicUrl(key);
            urlMap[fn] = url;
            const exists = forceUpload ? false : await s3KeyExists(key);
            if (exists) {
                alreadyPresent++;
            } else {
                const localPath = join(IMAGES_DIR, fn);
                const body = readFileSync(localPath);
                bytesUploaded += body.length;
                await s3Put(key, body, "image/png");
                uploaded++;
            }
            progress++;
            if (progress % 50 === 0 || progress === referencedFilenames.length) {
                console.log(
                    `  ${progress}/${referencedFilenames.length}  uploaded=${uploaded}  alreadyPresent=${alreadyPresent}`
                );
            }
        },
        IMAGE_UPLOAD_CONCURRENCY
    );

    writeFileSync(IMAGE_URLS_PATH, JSON.stringify(urlMap, null, 2));

    banner("IMAGES COMPLETE");
    console.log(`Uploaded                : ${uploaded}`);
    console.log(`Already on S3 (skipped) : ${alreadyPresent}`);
    console.log(`Bytes pushed            : ${(bytesUploaded / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Elapsed                 : ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
    console.log(
        `URL map                 : ${IMAGE_URLS_PATH}  (${Object.keys(urlMap).length} entries)`
    );
}

// ---------------------------------------------------------------------------
// PHASE C — single DB transaction: brands → families → assets
// ---------------------------------------------------------------------------

type BuiltAsset = {
    platform_id: string;
    company_id: string;
    warehouse_id: string;
    zone_id: string;
    brand_id: string | null;
    family_id: string | null;
    name: string;
    description: string | null;
    category: string;
    images: { url: string; note?: string }[];
    on_display_image: string | null;
    tracking_method: "INDIVIDUAL" | "BATCH";
    total_quantity: number;
    available_quantity: number;
    qr_code: string;
    weight_per_unit: string;
    dimensions: { length: number; width: number; height: number };
    volume_per_unit: string;
    handling_tags: string[];
    // Tracking back to source for the manifest. Composite (sheet, row) —
    // the cleaning tool numbers `row` per source sheet, so many rows share
    // the same row number across sheets.
    _source_sheet: string | null;
    _source_row: number;
};

async function runDb(pre?: PreflightResult) {
    banner(`DB  —  env: ${getAppEnv()}`);

    const r = pre ?? (await checkPreflight());
    if (r.blockers.length > 0 && !force) {
        console.log("✗ Pre-flight has blockers; refusing to proceed:");
        for (const f of r.blockers) console.log(`  - ${f}`);
        process.exitCode = 1;
        return;
    }
    if (!r.warehouse || !r.zone) {
        throw new Error("Internal: warehouse/zone missing despite preflight pass");
    }

    const urlMap = readImageUrlMap();

    // Sanity: every populated image_filename must have a URL.
    const missingUrls = r.inventory
        .map((row) => row.image_filename)
        .filter((f): f is string => Boolean(f) && f !== "image_filename")
        .filter((f) => !urlMap[f]);
    if (missingUrls.length > 0) {
        throw new Error(
            `Image URL map is missing ${missingUrls.length} entries. ` +
                "Re-run --phase=images. First few: " +
                missingUrls.slice(0, 3).join(", ")
        );
    }

    // Build the target row sets in memory before opening the txn so any
    // synthesis errors surface before we hold a DB lock.
    const distinctBrands = Array.from(new Set(r.inventory.map((row) => row.brand))).sort();
    const distinctFamilyNames = Array.from(
        new Set(r.inventory.map((row) => row.family_name).filter((n): n is string => Boolean(n)))
    );

    // Each family needs a representative source row (for category, brand, image, measurements).
    // Since multiple source rows may share family_name (4 cases per the data),
    // we use the FIRST occurrence as canonical.
    const familyCanonicalRow = new Map<string, InventoryRow>();
    for (const row of r.inventory) {
        if (row.family_name && !familyCanonicalRow.has(row.family_name)) {
            familyCanonicalRow.set(row.family_name, row);
        }
    }

    // Sanity: every distinct category resolves to an asset_categories row.
    for (const cat of r.uniqueCategories) {
        if (!r.categoriesByNameLc.has(cat.toLowerCase())) {
            throw new Error(`Internal: category "${cat}" not resolved despite preflight pass`);
        }
    }

    console.log("Plan to commit (single transaction):");
    console.log(`  brands         : ${distinctBrands.length}`);
    console.log(`  asset_families : ${distinctFamilyNames.length}`);
    console.log(`  assets         : ${r.totalAssetsExpected}`);
    console.log(`  warehouse      : ${r.warehouse.id}`);
    console.log(`  zone           : ${r.zone.id}`);

    if (dryRun) {
        console.log("\n[--dry-run — opening txn → all inserts → ROLLBACK]");
    }

    if (!yes && !dryRun) {
        console.log();
        if (!(await askYesNo("Commit?"))) {
            console.log("Aborted.");
            return;
        }
    }

    // Reserve qr_code candidates upfront and verify no collision with existing DB.
    const qrCodes = new Set<string>();
    while (qrCodes.size < r.totalAssetsExpected) qrCodes.add(generateQrCode());
    const qrArray = Array.from(qrCodes);
    const existingQr = await db
        .select({ qr_code: schema.assets.qr_code })
        .from(schema.assets)
        .where(inArray(schema.assets.qr_code, qrArray));
    if (existingQr.length > 0) {
        // Astronomical odds, but be deterministic about it.
        throw new Error(
            `${existingQr.length} generated QR code(s) collide with existing assets. ` +
                "Re-run the script — codes are randomly generated each invocation."
        );
    }

    type ManifestEntry = {
        sheet: string | null;
        source_row: number;
        family_id: string | null;
        asset_ids: string[];
        image_url: string | null;
    };
    const manifestByKey = new Map<string, ManifestEntry>();
    const sourceKey = (sheet: string | null, row: number) => `${sheet ?? ""}/${row}`;
    let createdBrands: { id: string; name: string }[] = [];
    let createdFamilies: { id: string; name: string }[] = [];
    let createdAssetCount = 0;

    const startedAt = Date.now();

    const runTxn = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
        // 1. brands
        const brandIdByName = new Map<string, string>();
        for (const brandName of distinctBrands) {
            const [inserted] = await tx
                .insert(schema.brands)
                .values({
                    platform_id: PLATFORM_ID,
                    company_id: COMPANY_ID,
                    name: brandName,
                    is_active: true,
                })
                .returning({ id: schema.brands.id, name: schema.brands.name });
            brandIdByName.set(brandName, inserted.id);
            createdBrands.push(inserted);
        }

        // 2. asset_families
        const familyIdByName = new Map<string, string>();
        for (const familyName of distinctFamilyNames) {
            const canonical = familyCanonicalRow.get(familyName)!;
            const cat = r.categoriesByNameLc.get(canonical.category.toLowerCase())!;
            const seed = familyName;
            const meas = deriveMeasurements(seed, familyName);
            const imgUrl = canonical.image_filename ? urlMap[canonical.image_filename] : null;
            const familyImages = imgUrl ? [{ url: imgUrl }] : [];

            const [inserted] = await tx
                .insert(schema.assetFamilies)
                .values({
                    platform_id: PLATFORM_ID,
                    company_id: COMPANY_ID,
                    brand_id: brandIdByName.get(canonical.brand) ?? null,
                    name: familyName,
                    category_id: cat.id,
                    images: familyImages as any,
                    on_display_image: imgUrl,
                    stock_mode: canonical.type,
                    weight_per_unit: meas.weightPerUnit,
                    volume_per_unit: meas.volumePerUnit,
                    dimensions: meas.dimensions as any,
                    is_active: true,
                })
                .returning({ id: schema.assetFamilies.id, name: schema.assetFamilies.name });
            familyIdByName.set(familyName, inserted.id);
            createdFamilies.push(inserted);
        }

        // 3. assets — build, batch-insert
        const allAssets: BuiltAsset[] = [];
        let qrCursor = 0;
        for (const row of r.inventory) {
            const brandId = brandIdByName.get(row.brand) ?? null;
            const familyId = row.family_name ? (familyIdByName.get(row.family_name) ?? null) : null;
            const imgUrl =
                row.image_filename && row.image_filename !== "image_filename"
                    ? (urlMap[row.image_filename] ?? null)
                    : null;
            const seed = row.family_name ?? row.asset_name;
            const meas = deriveMeasurements(seed, row.asset_name);
            const images = imgUrl ? [{ url: imgUrl }] : [];

            if (row.type === "POOLED") {
                allAssets.push({
                    platform_id: PLATFORM_ID,
                    company_id: COMPANY_ID,
                    warehouse_id: r.warehouse!.id,
                    zone_id: r.zone!.id,
                    brand_id: brandId,
                    family_id: familyId, // null per current decision; only SERIALIZED-with-family rows have a family
                    name: row.asset_name,
                    description: null,
                    category: row.category,
                    images,
                    on_display_image: imgUrl,
                    tracking_method: "BATCH",
                    total_quantity: row.qty,
                    available_quantity: row.qty,
                    qr_code: qrArray[qrCursor++],
                    weight_per_unit: meas.weightPerUnit,
                    dimensions: meas.dimensions,
                    volume_per_unit: meas.volumePerUnit,
                    handling_tags: [],
                    _source_sheet: row.sheet,
                    _source_row: row.row,
                });
            } else {
                // SERIALIZED — expand qty into individual asset rows.
                // qty=0 produces zero asset rows (placeholder family stays
                // empty until admin adds physical units).
                for (let i = 0; i < row.qty; i++) {
                    allAssets.push({
                        platform_id: PLATFORM_ID,
                        company_id: COMPANY_ID,
                        warehouse_id: r.warehouse!.id,
                        zone_id: r.zone!.id,
                        brand_id: brandId,
                        family_id: familyId,
                        name: row.asset_name,
                        description: null,
                        category: row.category,
                        images,
                        on_display_image: imgUrl,
                        tracking_method: "INDIVIDUAL",
                        total_quantity: 1,
                        available_quantity: 1,
                        qr_code: qrArray[qrCursor++],
                        weight_per_unit: meas.weightPerUnit,
                        dimensions: meas.dimensions,
                        volume_per_unit: meas.volumePerUnit,
                        handling_tags: [],
                        _source_sheet: row.sheet,
                        _source_row: row.row,
                    });
                }
            }
        }

        if (allAssets.length !== r.totalAssetsExpected) {
            throw new Error(
                `Built ${allAssets.length} asset rows, expected ${r.totalAssetsExpected}`
            );
        }

        // Pre-seed manifest with EVERY inventory row, including qty=0 ones
        // that produce no asset rows. Keeps the audit complete.
        for (const rr of r.inventory) {
            const k = sourceKey(rr.sheet, rr.row);
            const familyId = rr.family_name ? (familyIdByName.get(rr.family_name) ?? null) : null;
            const imgUrl =
                rr.image_filename && rr.image_filename !== "image_filename"
                    ? (urlMap[rr.image_filename] ?? null)
                    : null;
            manifestByKey.set(k, {
                sheet: rr.sheet,
                source_row: rr.row,
                family_id: familyId,
                asset_ids: [],
                image_url: imgUrl,
            });
        }

        // Batch-insert and capture IDs paired with their composite source key.
        const sourceKeysInOrder = allAssets.map((a) => sourceKey(a._source_sheet, a._source_row));
        for (let i = 0; i < allAssets.length; i += ASSET_INSERT_BATCH) {
            const batch = allAssets.slice(i, i + ASSET_INSERT_BATCH).map((a) => {
                const { _source_sheet: _s, _source_row: _r, ...rest } = a;
                return {
                    ...rest,
                    images: rest.images as any,
                    dimensions: rest.dimensions as any,
                };
            });
            const inserted = await tx
                .insert(schema.assets)
                .values(batch)
                .returning({ id: schema.assets.id });
            for (let j = 0; j < inserted.length; j++) {
                createdAssetCount++;
                const key = sourceKeysInOrder[i + j];
                const entry = manifestByKey.get(key);
                if (!entry) throw new Error(`Internal: pre-seeded manifest missing key ${key}`);
                entry.asset_ids.push(inserted[j].id);
            }
        }

        if (dryRun) {
            console.log("\n[--dry-run — rolling back the transaction]");
            throw new Error("__DRY_RUN_ROLLBACK__");
        }
    };

    try {
        await db.transaction(runTxn);
    } catch (err) {
        if (err instanceof Error && err.message === "__DRY_RUN_ROLLBACK__") {
            // Expected — dry-run path; manifest written below for audit.
        } else {
            throw err;
        }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    banner(dryRun ? "DB DRY-RUN COMPLETE (rolled back)" : "DB COMMIT COMPLETE");
    console.log(`Brands inserted       : ${createdBrands.length}`);
    console.log(`Families inserted     : ${createdFamilies.length}`);
    console.log(`Assets inserted       : ${createdAssetCount}`);
    console.log(`Elapsed               : ${elapsed} s`);

    // Manifest (always written — also on dry-run, so you can preview the shape)
    const manifestPath = `${dirname(NDJSON_PATH)}/manifest-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}${dryRun ? "-DRYRUN" : ""}.json`;
    const manifest = {
        import_run: `bacardi-${new Date().toISOString()}`,
        env: getAppEnv(),
        dry_run: dryRun,
        platform_id: PLATFORM_ID,
        company_id: COMPANY_ID,
        warehouse_id: r.warehouse.id,
        zone_id: r.zone.id,
        source: {
            xlsx_path: r.checksum.xlsx_path,
            xlsx_sha256: r.checksum.xlsx_sha256,
            extracted_at: r.checksum.extracted_at,
        },
        summary: {
            brands_created: createdBrands.length,
            families_created: createdFamilies.length,
            assets_created: createdAssetCount,
            image_urls: Object.keys(urlMap).length,
        },
        ids: {
            brands: createdBrands,
            families: createdFamilies,
            entries_by_source: Array.from(manifestByKey.values()).sort(
                (a, b) =>
                    (a.sheet ?? "").localeCompare(b.sheet ?? "") || a.source_row - b.source_row
            ),
        },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Manifest              : ${manifestPath}`);
}

// ---------------------------------------------------------------------------
// PHASE all — preflight → images → db
// ---------------------------------------------------------------------------

async function runAll() {
    banner(`ALL  —  env: ${getAppEnv()}  (preflight → images → db)`);
    const result = await checkPreflight();
    reportPreflight(result);
    if (result.blockers.length > 0 && !force) {
        console.log("\n✗ Aborting — blockers above. Run --phase=setup first or pass --force.");
        process.exitCode = 1;
        return;
    }
    if (!yes && !dryRun) {
        console.log();
        if (!(await askYesNo("Continue end-to-end?"))) {
            console.log("Aborted.");
            return;
        }
    }
    await runImages(result);
    await runDb(result);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    switch (phase) {
        case "preflight":
            await runPreflight();
            break;
        case "setup":
            await runSetup();
            break;
        case "images":
            await runImages();
            break;
        case "db":
            await runDb();
            break;
        case "all":
            await runAll();
            break;
        default:
            throw new Error(`Unknown phase "${phase}". Valid: preflight, setup, images, db, all.`);
    }
}

main()
    .catch((err) => {
        console.error(`\n✗ ${err instanceof Error ? err.message : err}\n`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
