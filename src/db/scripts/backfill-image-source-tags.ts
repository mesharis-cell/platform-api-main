/**
 * Backfill `source` tags (CLIENT | SCAN) onto existing asset image jsonb.
 *
 * Going-forward, every image writer tags its entries: the inbound scan tags
 * `SCAN` and merges (never deletes client photos); CBO/admin catalogue uploads
 * tag `CLIENT`. But pre-existing rows have NO tag, so the scan merge cannot tell
 * a client photo from a scan photo, and the planned catalogue/scan split
 * migration cannot partition deterministically. This one-time pass classifies
 * existing entries.
 *
 * Classification per asset (owner-locked, see ~/.claude/plans/CBO-IMAGE-RENAME-INTERIM-PLAN.md):
 *   1. An `asset_versions` 'Created' snapshot exists (the only place the original
 *      catalogue survives once a scan has replaced live `images`):
 *      a live `images` entry whose url is in that snapshot → CLIENT, else SCAN.
 *   2. else `last_scanned_at IS NULL` (never scanned → live `images` is still the
 *      original catalogue) → every entry CLIENT.
 *   3. else (scanned, no 'Created' snapshot — mainly PR-imported assets) → every
 *      entry SCAN. Least-complex; the original is unrecoverable and not fabricated.
 *   `group_images` is never scan-touched → every entry CLIENT.
 *   `on_display_image`: filled ONLY where currently NULL, and ONLY from a live
 *      CLIENT-classified image. Existing covers (incl. migration 0068's) are NEVER
 *      overwritten.
 *
 * NOTE: classification only — it does NOT re-inject a scanned asset's original
 * catalogue (which lives in the snapshot, not live `images`). Those still rely on
 * snapshot recovery in the followup migration.
 *
 * Idempotent: entries already carrying a `source` are left untouched; an asset
 * with nothing to change is skipped. Safe to re-run (e.g. to catch stragglers
 * created between deploy and the followup migration).
 *
 * Run:
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts \
 *     ./src/db/scripts/backfill-image-source-tags.ts --dry-run
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts \
 *     ./src/db/scripts/backfill-image-source-tags.ts
 */

import { eq, isNull } from "drizzle-orm";
import { db, pool } from "../index";
import { assertAppEnv } from "../safety/guards";
import { assets, assetVersions } from "../schema";

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

type ImageEntry = { url?: string; note?: string; source?: "CLIENT" | "SCAN" };

const urlOf = (entry: unknown): string | null => {
    if (entry && typeof entry === "object" && typeof (entry as ImageEntry).url === "string") {
        return (entry as ImageEntry).url as string;
    }
    return null;
};

async function main() {
    assertAppEnv(["staging", "production"]);
    const dryRun = hasFlag("dry-run");

    console.log(`\n=== Backfill image source tags (CLIENT | SCAN) ===`);
    console.log(`Mode: ${dryRun ? "DRY-RUN" : "APPLY"}\n`);

    // 1. Index the earliest 'Created' snapshot's catalogue urls per asset.
    //    Ordered by (asset_id, version_number ASC) so the first row seen per
    //    asset is its original 'Created' version.
    const createdSnaps = await db
        .select({
            asset_id: assetVersions.asset_id,
            version_number: assetVersions.version_number,
            snapshot: assetVersions.snapshot,
        })
        .from(assetVersions)
        .where(eq(assetVersions.reason, "Created"))
        .orderBy(assetVersions.asset_id, assetVersions.version_number);

    const createdUrls = new Map<string, Set<string>>();
    for (const row of createdSnaps) {
        if (createdUrls.has(row.asset_id)) continue; // lowest version wins (ordered ASC)
        const snap = row.snapshot as { images?: unknown } | null;
        const imgs = Array.isArray(snap?.images) ? snap!.images : [];
        const set = new Set<string>();
        for (const im of imgs) {
            const u = urlOf(im);
            if (u) set.add(u);
        }
        createdUrls.set(row.asset_id, set);
    }
    console.log(`'Created' snapshots indexed: ${createdUrls.size}`);

    // 2. Walk every live asset.
    const rows = await db
        .select({
            id: assets.id,
            images: assets.images,
            group_images: assets.group_images,
            on_display_image: assets.on_display_image,
            last_scanned_at: assets.last_scanned_at,
        })
        .from(assets)
        .where(isNull(assets.deleted_at));

    let updated = 0;
    let skipped = 0;
    let clientTagged = 0;
    let scanTagged = 0;
    let heroFilled = 0;

    for (const a of rows) {
        const images: ImageEntry[] = Array.isArray(a.images) ? (a.images as ImageEntry[]) : [];
        const groupImages: ImageEntry[] = Array.isArray(a.group_images)
            ? (a.group_images as ImageEntry[])
            : [];

        // The CLIENT url set for this asset.
        let clientSet: Set<string>;
        const snap = createdUrls.get(a.id);
        if (snap) {
            clientSet = snap; // (1) recover catalogue from Created snapshot
        } else if (a.last_scanned_at == null) {
            // (2) never scanned → live images are still catalogue
            clientSet = new Set(images.map(urlOf).filter((u): u is string => Boolean(u)));
        } else {
            clientSet = new Set(); // (3) scanned, no snapshot → all SCAN
        }

        let changed = false;

        const newImages = images.map((entry) => {
            if (entry?.source === "CLIENT" || entry?.source === "SCAN") return entry;
            const u = urlOf(entry);
            const src: "CLIENT" | "SCAN" = u && clientSet.has(u) ? "CLIENT" : "SCAN";
            changed = true;
            if (src === "CLIENT") clientTagged++;
            else scanTagged++;
            return { ...entry, source: src };
        });

        const newGroupImages = groupImages.map((entry) => {
            if (entry?.source === "CLIENT" || entry?.source === "SCAN") return entry;
            changed = true;
            clientTagged++;
            return { ...entry, source: "CLIENT" as const };
        });

        // Fill the cover only when unset, only from a live CLIENT photo. Never overwrite.
        let newOnDisplay = a.on_display_image;
        if (!a.on_display_image) {
            const clientHero = newImages.find((entry) => entry.source === "CLIENT" && urlOf(entry));
            if (clientHero) {
                newOnDisplay = urlOf(clientHero)!;
                heroFilled++;
                changed = true;
            }
        }

        if (!changed) {
            skipped++;
            continue;
        }

        updated++;
        if (!dryRun) {
            await db
                .update(assets)
                .set({
                    images: newImages,
                    group_images: newGroupImages,
                    on_display_image: newOnDisplay,
                })
                .where(eq(assets.id, a.id));
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Assets scanned:          ${rows.length}`);
    console.log(`Assets updated:          ${updated}`);
    console.log(`Assets skipped:          ${skipped} (already tagged / nothing to do)`);
    console.log(`Image entries → CLIENT:  ${clientTagged}`);
    console.log(`Image entries → SCAN:    ${scanTagged}`);
    console.log(`on_display_image filled: ${heroFilled}`);
    console.log(dryRun ? `\n(dry-run — no rows written)\n` : `\n✅ Backfill complete.\n`);

    await pool.end();
}

main().catch((err) => {
    console.error(`\n❌ Backfill failed:`, err);
    process.exitCode = 1;
    pool.end().catch(() => {});
});
