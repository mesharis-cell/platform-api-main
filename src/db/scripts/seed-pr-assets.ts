/**
 * Pernod Ricard Asset Migration
 *
 * Migrates 576 assets from the thin-MVP Dropbox/MongoDB system into Kadence.
 * Each source PDF → one Asset in the system. Embedded photos → images[].
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
import { db } from "../index";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BUNDLE_DIR = path.resolve(
    process.cwd(),
    "seed/preview-latest/preview-latest"
);
const DOCS_FILE = path.join(BUNDLE_DIR, "docs.ndjson");
const ASSETS_FILE = path.join(BUNDLE_DIR, "assets.ndjson");
const PHOTOS_DIR = path.join(BUNDLE_DIR, "files/photos");

const isDryRun = process.argv.includes("--dry-run");
const skipPhotos = process.argv.includes("--skip-photos");

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

async function s3KeyExists(key: string): Promise<boolean> {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        return true;
    } catch {
        return false;
    }
}

async function uploadPhoto(hash: string): Promise<string | null> {
    const localPath = path.join(PHOTOS_DIR, `${hash}.jpg`);
    if (!existsSync(localPath)) return null;

    const key = `${S3_PREFIX}/${hash}.jpg`;
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

// ---------------------------------------------------------------------------
// Derive a stable, short QR code from the docExternalKey
// ---------------------------------------------------------------------------

function deriveQrCode(docExternalKey: string): string {
    // Keep it under 100 chars, unique, human-identifiable
    const safe = docExternalKey.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    return `PR-${safe.slice(-20)}`;
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

    if (!existsSync(DOCS_FILE)) {
        console.warn(`⚠️  PR asset bundle not found at ${BUNDLE_DIR} — skipping.`);
        return;
    }

    const log = (msg: string) => {
        if (!quiet || msg.startsWith("✓") || msg.startsWith("⚠") || msg.startsWith("❌"))
            console.log(msg);
    };

    log("📦 Reading PR bundle…");
    const [docs, photoAssets] = await Promise.all([
        readNdjson(DOCS_FILE),
        readNdjson(ASSETS_FILE),
    ]);
    log(`   ${docs.length} docs, ${photoAssets.length} photo assets`);

    // Build photo hash → ordered list (position-sorted) for each doc
    const photosByDoc: Record<string, string[]> = {};
    for (const pa of photoAssets) {
        for (const ref of pa.sourceRefs ?? []) {
            const key = ref.docExternalKey as string;
            if (!photosByDoc[key]) photosByDoc[key] = [];
            photosByDoc[key][ref.position - 1] = pa.assetExternalKey as string;
        }
    }

    // -----------------------------------------------------------------------
    // 1. Upload photos to S3 → build hash→URL map
    // -----------------------------------------------------------------------
    log("📸 Uploading photos to S3…");
    const urlByHash: Record<string, string> = {};
    let uploaded = 0;
    let skipped = 0;

    for (const pa of photoAssets) {
        const hash = pa.assetExternalKey as string;
        if (opts.skipPhotoUpload || skipPhotos) {
            urlByHash[hash] = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${S3_PREFIX}/${hash}.jpg`;
            skipped++;
        } else {
            const url = await uploadPhoto(hash);
            if (url) {
                urlByHash[hash] = url;
                uploaded++;
            }
        }
    }
    log(`   Uploaded: ${uploaded}, skipped/dry: ${skipped}`);

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
            .where(
                and(
                    eq(schema.brands.company_id, companyId),
                    eq(schema.brands.name, brandName)
                )
            )
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

    for (const doc of docs) {
        try {
            const canonicalBrand = CATEGORY_TO_BRAND[doc.category] ?? "Unknown";
            const brandId = brandMap[canonicalBrand];
            const qrCode = deriveQrCode(doc.docExternalKey);

            // Build images array (position-ordered)
            const hashes: string[] = (photosByDoc[doc.docExternalKey] ?? []).filter(Boolean);
            const images = hashes.map((h) => urlByHash[h]).filter(Boolean) as string[];
            const onDisplayImage = images[0] ?? null;

            if (isDryRun) {
                log(
                    `  [DRY] "${doc.title}" → brand: ${canonicalBrand}, photos: ${images.length}, qr: ${qrCode}`
                );
                continue;
            }

            // Check for existing asset by qr_code (idempotent)
            const [existing] = await db
                .select({ id: schema.assets.id })
                .from(schema.assets)
                .where(eq(schema.assets.qr_code, qrCode))
                .limit(1);

            if (existing) {
                // Update images if we have new ones
                await db
                    .update(schema.assets)
                    .set({
                        images,
                        on_display_image: onDisplayImage,
                        brand_id: brandId ?? null,
                    })
                    .where(eq(schema.assets.id, existing.id));
                updated++;
            } else {
                await db.insert(schema.assets).values({
                    platform_id: platformId,
                    company_id: companyId,
                    warehouse_id: warehouseId,
                    zone_id: zoneId,
                    brand_id: brandId ?? null,
                    name: doc.title,
                    description: `Source: ${doc.sourcePath}`,
                    category: canonicalBrand,
                    images,
                    on_display_image: onDisplayImage,
                    tracking_method: "BATCH",
                    total_quantity: 1,
                    available_quantity: 1,
                    qr_code: qrCode,
                    weight_per_unit: "0.00",
                    volume_per_unit: "0.000",
                    dimensions: {},
                    condition: "GREEN",
                    status: "AVAILABLE",
                });
                created++;
            }
        } catch (err: any) {
            console.error(`  ❌ Failed "${doc.title}": ${err.message}`);
            errors++;
        }
    }

    log(`✓ Assets: ${created} created, ${updated} updated, ${errors} errors`);
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
    const [platform] = await db
        .select({ id: schema.platforms.id })
        .from(schema.platforms)
        .limit(1);
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
        console.error('❌ Pernod Ricard company not found. Run seed first.');
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

// Run standalone if executed directly
if (import.meta.main) {
    runStandalone().catch((err) => {
        console.error("Fatal:", err);
        process.exit(1);
    });
}
