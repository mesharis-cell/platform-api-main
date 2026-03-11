/**
 * Pernod Ricard Asset Migration
 *
 * Migrates preview-latest baseline package from the thin-MVP source into Kadence.
 * Package counts are validated against manifest.json at runtime.
 * Each source PDF item → one Asset in the system. Linked extracted photos → images[].
 *
 * Usage:
 *   bun run src/db/scripts/seed-pr-assets.ts            # live run
 *   bun run src/db/scripts/seed-pr-assets.ts --dry-run  # preview only
 *   bun run src/db/scripts/seed-pr-assets.ts --skip-photos  # skip S3 upload
 *
 * Can also be called programmatically from seed.ts:
 *   import { seedPrAssets } from "./scripts/seed-pr-assets";
 *   await seedPrAssets({ platformId, companyId, warehouseId, zoneId });
 */

import "dotenv/config";
import { createReadStream, existsSync, readFileSync } from "fs";
import * as path from "path";
import { createInterface } from "readline";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { db } from "../index";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";
import { qrCodeGenerator } from "../../app/utils/qr-code-generator";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BUNDLE_DIR = path.resolve(process.cwd(), "seed/preview-latest");
const PHOTOS_DIR = path.join(BUNDLE_DIR, "files/photos");
const IMPORT_DOCS_FILE = path.join(BUNDLE_DIR, "import/docs-import.ndjson");
const IMPORT_ASSETS_FILE = path.join(BUNDLE_DIR, "import/assets-import.ndjson");
const MANIFEST_FILE = path.join(BUNDLE_DIR, "manifest.json");
const CHECKSUMS_FILE = path.join(BUNDLE_DIR, "checksums.sha256");
const EXPECTED_DOC_COUNT = 577;
const EXPECTED_ASSET_COUNT = 1351;

const isDryRun = process.argv.includes("--dry-run");
const skipPhotos = process.argv.includes("--skip-photos");
const skipChecksums = process.argv.includes("--skip-checksums");

// ---------------------------------------------------------------------------
// Category → canonical brand name
// ---------------------------------------------------------------------------

const CATEGORY_TO_BRAND: Record<string, string> = {
    "Absolut.": "Absolut",
    Absolut: "Absolut",
    Altos: "Altos",
    Avion: "Avion",
    Barracuda: "Barracuda",
    Beefeater: "Beefeater",
    "Blenders Pride": "Blenders Pride",
    "Casa Altos": "Altos",
    Cedar: "Cedar's",
    Ceder: "Cedar's",
    Chivas: "Chivas Regal",
    "Cross Brand": "Multi-Brand",
    Fridges: "General",
    "GH Mumm": "Mumm",
    "Havana Club": "Havana Club",
    Jameson: "Jameson",
    "Le Cercle": "Le Cercle",
    Lillet: "Lillet",
    "Longitude 77": "Longitude 77",
    Longmorn: "Longmorn",
    Malfy: "Malfy",
    Martel: "Martell",
    Martell: "Martell",
    Moet: "Moët",
    "Monkey 47": "Monkey 47",
    Multibrand: "Multi-Brand",
    Mumm: "Mumm",
    PJ: "Perrier-Jouët",
    PRG: "General",
    Ricard: "Ricard",
    "Royal Salute": "Royal Salute",
    "Royal Stag": "Royal Stag",
    "Sainte Marguerite": "Sainte Marguerite",
    Sip: "Sipsmith",
    Sushisamba: "General",
    TGL: "The Glenlivet",
    UNIDENTIFIED: "Unknown",
};

// All unique canonical brand names derived from PR source data
const PR_BRANDS = [...new Set(Object.values(CATEGORY_TO_BRAND))].sort();

// ---------------------------------------------------------------------------
// S3
// ---------------------------------------------------------------------------

const s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const S3_BUCKET = process.env.AWS_BUCKET_NAME!;
const S3_PREFIX = "assets/pr-import";

type AssetCondition = "GREEN" | "ORANGE" | "RED";

type AssetSizingProfile = {
    key: string;
    lengthRange: [number, number];
    widthRange: [number, number];
    heightRange: [number, number];
    weightRange: [number, number];
};

type ImportDocRow = {
    externalKey?: string;
    docExternalKey?: string;
    title: string;
    category?: string;
    sourcePath?: string;
    metadata?: { sourcePath?: string };
    assetExternalKeys?: string[];
};

type ImportAssetRow = {
    externalKey?: string;
    assetExternalKey?: string;
    filePath?: string;
    bundlePhotoPath?: string;
    imageTitle?: string | null;
    note?: string | null;
    condition?: string | null;
    sourceDocumentKeys?: string[];
    sourceRefs?: Array<{ docExternalKey?: string; position?: number; sourceObjectIndex?: number }>;
};

async function s3KeyExists(key: string): Promise<boolean> {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        return true;
    } catch {
        return false;
    }
}

function getAssetExternalKey(asset: ImportAssetRow): string {
    const key = asset.externalKey ?? asset.assetExternalKey;
    if (!key) throw new Error("Asset row missing external key");
    return key;
}

function getDocExternalKey(doc: ImportDocRow): string {
    const key = doc.externalKey ?? doc.docExternalKey;
    if (!key) throw new Error("Doc row missing external key");
    return key;
}

function toAssetCondition(value: unknown): AssetCondition {
    const normalized = String(value ?? "")
        .trim()
        .toUpperCase();
    if (normalized === "RED") return "RED";
    if (normalized === "ORANGE") return "ORANGE";
    if (normalized === "GREEN") return "GREEN";
    throw new Error(`Invalid/missing asset condition in import package: "${String(value)}"`);
}

function combineImageNote(
    imageTitle?: string | null,
    note?: string | null,
    condition?: string | null
) {
    const parts: string[] = [];
    if (imageTitle && imageTitle.trim()) parts.push(imageTitle.trim());
    if (note && note.trim()) parts.push(note.trim());
    const normalizedCondition = toAssetCondition(condition);
    if (normalizedCondition !== "GREEN") parts.push(`Condition: ${normalizedCondition}`);
    return parts.length ? parts.join(" | ") : undefined;
}

function buildConditionNotes(photoRows: ImportAssetRow[]): string | null {
    const flagged = photoRows.filter((row) => toAssetCondition(row.condition) !== "GREEN");
    if (!flagged.length) return null;

    const summary = flagged.slice(0, 5).map((row, index) => {
        const label = row.imageTitle?.trim() || `Image ${index + 1}`;
        return `${toAssetCondition(row.condition)}: ${label}`;
    });

    return `Imported condition flags - ${summary.join("; ")}`;
}

const SIZING_PROFILES: AssetSizingProfile[] = [
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

function getDeterministicNumber(seed: string, salt: string): number {
    const digest = createHash("sha256").update(`${seed}:${salt}`).digest("hex").slice(0, 8);
    return parseInt(digest, 16) / 0xffffffff;
}

function pickFromRange(
    seed: string,
    salt: string,
    [min, max]: [number, number],
    precision = 0
): number {
    const value = min + getDeterministicNumber(seed, salt) * (max - min);
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

function inferSizingProfile(title: string, sourcePath?: string): AssetSizingProfile {
    const haystack = `${title} ${sourcePath ?? ""}`.toLowerCase();

    if (
        /(backdrop|wall|arch|frame|fascia|totem|booth|stand|activation|display unit|display wall|installation|structure|gantry|portal)/.test(
            haystack
        )
    ) {
        return SIZING_PROFILES[0];
    }
    if (/(bar|counter|station|serve station|sampling unit)/.test(haystack)) {
        return SIZING_PROFILES[1];
    }
    if (/(table|desk|console|display table)/.test(haystack)) {
        return SIZING_PROFILES[2];
    }
    if (/(chair|stool|bench|seat|seating)/.test(haystack)) {
        return SIZING_PROFILES[3];
    }
    if (/(shelf|shelving|rack|cabinet|bookcase|display shelf)/.test(haystack)) {
        return SIZING_PROFILES[4];
    }
    if (/(fridge|cooler|freezer|ice box|chiller)/.test(haystack)) {
        return SIZING_PROFILES[5];
    }
    if (/(sign|neon|lightbox|light box|lamp|lighting|led)/.test(haystack)) {
        return SIZING_PROFILES[6];
    }
    if (/(plinth|podium|pedestal|cube)/.test(haystack)) {
        return SIZING_PROFILES[7];
    }
    if (/(bucket|tray|crate|menu|props|prop|smallware|accessory)/.test(haystack)) {
        return SIZING_PROFILES[8];
    }

    return SIZING_PROFILES[9];
}

function deriveAssetMeasurements(docTitle: string, docExternalKey: string, sourcePath?: string) {
    const profile = inferSizingProfile(docTitle, sourcePath);
    const seed = `${docExternalKey}:${docTitle}`;

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

async function uploadPhoto(asset: ImportAssetRow): Promise<string | null> {
    const externalKey = getAssetExternalKey(asset);
    const relativePath = asset.filePath ?? asset.bundlePhotoPath;
    const resolvedByPath = relativePath ? path.join(BUNDLE_DIR, relativePath) : "";
    const fallbackPath = path.join(PHOTOS_DIR, `${externalKey}.jpg`);
    const localPath = existsSync(resolvedByPath) ? resolvedByPath : fallbackPath;
    if (!existsSync(localPath)) return null;

    const key = `${S3_PREFIX}/${externalKey}.jpg`;
    const url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    if (isDryRun || skipPhotos) return url;

    const exists = await s3KeyExists(key);
    if (exists) return url;

    const body = readFileSync(localPath);
    await s3.send(
        new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: body,
            ContentType: "image/jpeg",
        })
    );
    return url;
}

// ---------------------------------------------------------------------------
// NDJSON reader
// ---------------------------------------------------------------------------

async function readNdjson(filePath: string): Promise<any[]> {
    const rows: any[] = [];
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed) rows.push(JSON.parse(trimmed));
    }
    return rows;
}

async function sha256File(filePath: string): Promise<string> {
    return await new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        const stream = createReadStream(filePath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

function parseChecksums(contents: string): Array<{ hash: string; relativePath: string }> {
    return contents
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
            if (!match) throw new Error(`Invalid checksum row: ${line}`);
            return { hash: match[1].toLowerCase(), relativePath: match[2] };
        });
}

async function verifyPackageChecksums(log: (msg: string) => void): Promise<void> {
    if (!existsSync(CHECKSUMS_FILE)) {
        throw new Error(`checksums.sha256 not found at ${CHECKSUMS_FILE}`);
    }

    const rows = parseChecksums(readFileSync(CHECKSUMS_FILE, "utf8"));
    log(`🔐 Verifying checksums (${rows.length} files)…`);

    let verified = 0;
    for (const row of rows) {
        const targetPath = path.join(BUNDLE_DIR, row.relativePath);
        if (!existsSync(targetPath)) {
            throw new Error(`Missing file listed in checksums: ${row.relativePath}`);
        }
        const actual = await sha256File(targetPath);
        if (actual !== row.hash) {
            throw new Error(`Checksum mismatch for ${row.relativePath}`);
        }
        verified++;
        if (verified % 250 === 0) log(`   Verified ${verified}/${rows.length}…`);
    }

    log(`✓ Checksums verified (${verified}/${rows.length})`);
}

function readManifest(): any {
    if (!existsSync(MANIFEST_FILE)) throw new Error(`manifest.json not found at ${MANIFEST_FILE}`);
    return JSON.parse(readFileSync(MANIFEST_FILE, "utf8"));
}

// ---------------------------------------------------------------------------
// Main export (callable from seed.ts)
// ---------------------------------------------------------------------------

export interface SeedPrAssetsOptions {
    platformId: string;
    companyId: string;
    warehouseId: string;
    zoneId: string;
    /** Skip S3 uploads (use placeholder URL pattern) */
    skipPhotoUpload?: boolean;
    verbose?: boolean;
}

export async function seedPrAssets(opts: SeedPrAssetsOptions) {
    const { platformId, companyId, warehouseId, zoneId } = opts;
    const quiet = !opts.verbose;

    if (!existsSync(IMPORT_DOCS_FILE) || !existsSync(IMPORT_ASSETS_FILE)) {
        console.warn(
            `⚠️  Required import files not found under ${BUNDLE_DIR}/import (docs-import.ndjson, assets-import.ndjson) — skipping.`
        );
        return;
    }

    const log = (msg: string) => {
        if (!quiet || msg.startsWith("✓") || msg.startsWith("⚠") || msg.startsWith("❌"))
            console.log(msg);
    };

    if (!skipChecksums) await verifyPackageChecksums(log);
    else log("⚠️  Skipping checksum verification (--skip-checksums)");

    const manifest = readManifest();
    log("📦 Reading PR bundle…");
    const [rawDocs, rawPhotoAssets] = await Promise.all([
        readNdjson(IMPORT_DOCS_FILE),
        readNdjson(IMPORT_ASSETS_FILE),
    ]);
    const docs = rawDocs as ImportDocRow[];
    const photoAssets = rawPhotoAssets as ImportAssetRow[];
    log(`   ${docs.length} docs, ${photoAssets.length} photo assets`);

    if (
        manifest?.counts?.docs !== undefined &&
        Number(manifest.counts.docs) !== Number(docs.length)
    ) {
        throw new Error(
            `Manifest/docs count mismatch: manifest=${manifest.counts.docs}, actual=${docs.length}`
        );
    }
    if (
        manifest?.counts?.assets !== undefined &&
        Number(manifest.counts.assets) !== Number(photoAssets.length)
    ) {
        throw new Error(
            `Manifest/assets count mismatch: manifest=${manifest.counts.assets}, actual=${photoAssets.length}`
        );
    }
    if (Number(docs.length) !== EXPECTED_DOC_COUNT) {
        throw new Error(
            `Unexpected docs count for preview-latest: expected=${EXPECTED_DOC_COUNT}, actual=${docs.length}`
        );
    }
    if (Number(photoAssets.length) !== EXPECTED_ASSET_COUNT) {
        throw new Error(
            `Unexpected assets count for preview-latest: expected=${EXPECTED_ASSET_COUNT}, actual=${photoAssets.length}`
        );
    }
    if (docs.length === 0) {
        throw new Error("Import package has zero docs; refusing to continue");
    }
    if (photoAssets.length === 0) {
        throw new Error("Import package has zero photo assets; refusing to continue");
    }

    const photoByExternalKey = new Map<string, ImportAssetRow>();
    for (const photo of photoAssets) {
        photoByExternalKey.set(getAssetExternalKey(photo), photo);
    }

    // Fail fast on unresolved doc->asset references before any writes.
    const unresolvedDocAssetRefs: string[] = [];
    for (const doc of docs) {
        const docExternalKey = getDocExternalKey(doc);
        const linkedExternalKeys: string[] = (doc.assetExternalKeys ?? []).filter(Boolean);
        for (const externalKey of linkedExternalKeys) {
            if (!photoByExternalKey.has(externalKey)) {
                if (unresolvedDocAssetRefs.length < 25) {
                    unresolvedDocAssetRefs.push(`${docExternalKey} -> ${externalKey}`);
                }
            }
        }
    }
    if (unresolvedDocAssetRefs.length > 0) {
        throw new Error(
            `Unresolved doc->asset references found. Sample: ${unresolvedDocAssetRefs.join(", ")}`
        );
    }

    // -----------------------------------------------------------------------
    // 1. Upload photos to S3 → build hash→URL map
    // -----------------------------------------------------------------------
    log("📸 Uploading photos to S3…");
    const urlByExternalKey: Record<string, string> = {};
    let uploaded = 0;
    let skippedUploads = 0;
    let photoMissing = 0;

    for (const pa of photoAssets) {
        const externalKey = getAssetExternalKey(pa);
        if (opts.skipPhotoUpload || skipPhotos) {
            urlByExternalKey[externalKey] =
                `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${S3_PREFIX}/${externalKey}.jpg`;
            skippedUploads++;
        } else {
            const url = await uploadPhoto(pa);
            if (url) {
                urlByExternalKey[externalKey] = url;
                uploaded++;
            } else {
                photoMissing++;
            }
        }
    }
    log(`   Uploaded: ${uploaded}, skipped/dry: ${skippedUploads}, missing-local: ${photoMissing}`);

    // -----------------------------------------------------------------------
    // 2. Upsert brands
    // -----------------------------------------------------------------------
    log("🏷️  Upserting PR brands…");
    const brandMap: Record<string, string> = {}; // brandName → id

    for (const brandName of PR_BRANDS) {
        if (isDryRun) {
            brandMap[brandName] = `dry-run-${brandName}`;
            continue;
        }
        const [existing] = await db
            .select({ id: schema.brands.id })
            .from(schema.brands)
            .where(and(eq(schema.brands.company_id, companyId), eq(schema.brands.name, brandName)))
            .limit(1);

        if (existing) {
            brandMap[brandName] = existing.id;
        } else {
            const [inserted] = await db
                .insert(schema.brands)
                .values({
                    platform_id: platformId,
                    company_id: companyId,
                    name: brandName,
                    description: `${brandName} brand assets (imported from thin-MVP)`,
                    is_active: true,
                })
                .returning({ id: schema.brands.id });
            brandMap[brandName] = inserted.id;
        }
    }
    log(`✓ ${PR_BRANDS.length} brands ready`);

    // -----------------------------------------------------------------------
    // 3. Upsert assets (one per doc)
    // -----------------------------------------------------------------------
    log("🗂️  Importing assets…");
    let created = 0;
    let updated = 0;
    let errors = 0;
    let skipped = 0;
    let totalLinks = 0;
    let unresolvedLinks = 0;
    const unresolvedSamples: string[] = [];

    // Prefer external-key marker idempotency, fallback to name for legacy rows.
    const existingAssets = await db
        .select({
            id: schema.assets.id,
            name: schema.assets.name,
            description: schema.assets.description,
        })
        .from(schema.assets)
        .where(eq(schema.assets.company_id, companyId));
    const existingByName = new Map(existingAssets.map((a) => [a.name.toLowerCase(), a]));
    const existingByExternalKey = new Map<string, (typeof existingAssets)[number]>();
    for (const asset of existingAssets) {
        const text = asset.description || "";
        const match = text.match(/\[docExternalKey:([^\]]+)\]/);
        if (match?.[1]) existingByExternalKey.set(match[1], asset);
    }

    for (const doc of docs) {
        try {
            const docExternalKey = getDocExternalKey(doc);
            const canonicalBrand = CATEGORY_TO_BRAND[doc.category || ""] ?? "Unknown";
            const brandId = brandMap[canonicalBrand];
            const docTitle = doc.title || docExternalKey;
            const sourcePath = doc.metadata?.sourcePath || doc.sourcePath || "N/A";

            const linkedExternalKeys: string[] = (doc.assetExternalKeys ?? []).filter(Boolean);
            totalLinks += linkedExternalKeys.length;

            const linkedPhotoRows: ImportAssetRow[] = [];
            const images = linkedExternalKeys
                .map((externalKey) => {
                    const url = urlByExternalKey[externalKey];
                    const photo = photoByExternalKey.get(externalKey);
                    if (!url || !photo) {
                        unresolvedLinks++;
                        if (unresolvedSamples.length < 20) {
                            unresolvedSamples.push(
                                `${docExternalKey} -> ${externalKey} (${!photo ? "asset-key-missing" : "url-missing"})`
                            );
                        }
                        return null;
                    }

                    linkedPhotoRows.push(photo);
                    const note = combineImageNote(photo.imageTitle, photo.note, photo.condition);
                    return note ? { url, note } : { url };
                })
                .filter(Boolean) as Array<{ url: string; note?: string }>;

            if (linkedExternalKeys.length > 0 && images.length === 0) {
                skipped++;
                log(`  ⚠️  Skipping "${docTitle}" (all linked images unresolved)`);
                continue;
            }

            const onDisplayImage = images[0]?.url ?? null;
            const linkedConditions = linkedPhotoRows.map((row) => toAssetCondition(row.condition));
            const distinctConditions = Array.from(new Set(linkedConditions));
            if (distinctConditions.length > 1) {
                throw new Error(
                    `Mixed linked image conditions for ${docExternalKey}: ${distinctConditions.join(", ")}`
                );
            }
            const derivedCondition = distinctConditions[0] ?? "ORANGE";
            const refurbDaysEstimate =
                derivedCondition === "RED" ? 7 : derivedCondition === "ORANGE" ? 3 : null;
            const derivedConditionNotes = buildConditionNotes(linkedPhotoRows);
            const description = null;
            const measurements = deriveAssetMeasurements(docTitle, docExternalKey, sourcePath);

            if (isDryRun) {
                const existing =
                    existingByExternalKey.get(docExternalKey) ??
                    existingByName.get(docTitle.toLowerCase());
                log(
                    `  [DRY] "${docTitle}" (${docExternalKey}) → brand: ${canonicalBrand}, photos: ${images.length}${existing ? " [would update]" : " [would insert]"}`
                );
                continue;
            }

            const existing =
                existingByExternalKey.get(docExternalKey) ??
                existingByName.get(docTitle.toLowerCase());

            if (existing) {
                await db
                    .update(schema.assets)
                    .set({
                        name: docTitle,
                        description,
                        images,
                        on_display_image: onDisplayImage,
                        brand_id: brandId ?? null,
                        category: canonicalBrand,
                        condition: derivedCondition,
                        refurb_days_estimate: refurbDaysEstimate,
                        condition_notes: derivedConditionNotes,
                        weight_per_unit: measurements.weightPerUnit,
                        volume_per_unit: measurements.volumePerUnit,
                        dimensions: measurements.dimensions,
                    })
                    .where(eq(schema.assets.id, existing.id));
                updated++;
            } else {
                const qrCode = await qrCodeGenerator(companyId);
                await db.insert(schema.assets).values({
                    platform_id: platformId,
                    company_id: companyId,
                    warehouse_id: warehouseId,
                    zone_id: zoneId,
                    brand_id: brandId ?? null,
                    name: docTitle,
                    description,
                    category: canonicalBrand,
                    images,
                    on_display_image: onDisplayImage,
                    tracking_method: "INDIVIDUAL",
                    total_quantity: 1,
                    available_quantity: 1,
                    qr_code: qrCode,
                    weight_per_unit: measurements.weightPerUnit,
                    volume_per_unit: measurements.volumePerUnit,
                    dimensions: measurements.dimensions,
                    condition: derivedCondition,
                    refurb_days_estimate: refurbDaysEstimate,
                    condition_notes: derivedConditionNotes,
                    status: "AVAILABLE",
                });
                created++;
            }
        } catch (err: any) {
            const label = doc.title || getDocExternalKey(doc);
            console.error(`  ❌ Failed "${label}": ${err.message}`);
            errors++;
        }
    }

    log(`✓ Assets: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`);
    log(
        `✓ Links: ${totalLinks} total, ${totalLinks - unresolvedLinks} resolved, ${unresolvedLinks} unresolved`
    );
    if (unresolvedSamples.length) {
        log("⚠️  Unresolved reference samples:");
        for (const sample of unresolvedSamples) log(`   - ${sample}`);
    }
}

// ---------------------------------------------------------------------------
// Standalone entry point
// ---------------------------------------------------------------------------

async function runStandalone() {
    console.log(`\n🚀 PR Asset Migration ${isDryRun ? "[DRY RUN]" : "[LIVE]"}\n`);

    if (!existsSync(BUNDLE_DIR)) {
        console.error(`❌ Bundle not found: ${BUNDLE_DIR}`);
        process.exit(1);
    }

    // Resolve platform
    const [platform] = await db.select({ id: schema.platforms.id }).from(schema.platforms).limit(1);
    if (!platform) {
        console.error("❌ No platform found in DB. Run seed first.");
        process.exit(1);
    }

    // Resolve Pernod Ricard company
    const [company] = await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(eq(schema.companies.domain, "pernod-ricard"))
        .limit(1);
    if (!company) {
        console.error("❌ Pernod Ricard company not found. Run seed first.");
        process.exit(1);
    }

    // Resolve warehouse (first one on the platform)
    const [warehouse] = await db
        .select({ id: schema.warehouses.id })
        .from(schema.warehouses)
        .where(eq(schema.warehouses.platform_id, platform.id))
        .limit(1);
    if (!warehouse) {
        console.error("❌ No warehouse found. Run seed first.");
        process.exit(1);
    }

    // Resolve PR zone
    const [zone] = await db
        .select({ id: schema.zones.id })
        .from(schema.zones)
        .where(eq(schema.zones.company_id, company.id))
        .limit(1);
    if (!zone) {
        console.error("❌ No zone found for Pernod Ricard. Run seed first.");
        process.exit(1);
    }

    console.log(`Platform : ${platform.id}`);
    console.log(`Company  : ${company.id}`);
    console.log(`Warehouse: ${warehouse.id}`);
    console.log(`Zone     : ${zone.id}\n`);

    await seedPrAssets({
        platformId: platform.id,
        companyId: company.id,
        warehouseId: warehouse.id,
        zoneId: zone.id,
        skipPhotoUpload: skipPhotos,
        verbose: true,
    });

    console.log("\n✅ Done.\n");
    process.exit(0);
}

// Run standalone when called directly via tsx/bun
if (require.main === module) {
    runStandalone().catch((err) => {
        console.error("Fatal:", err);
        process.exit(1);
    });
}
