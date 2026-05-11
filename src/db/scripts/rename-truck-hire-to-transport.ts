/**
 * RENAME "Truck Hire — …" → "Transport — …" IN service_types CATALOG
 *
 * One-shot rename of all platform service_types rows whose name starts with
 * "Truck Hire — " to use the "Transport — " prefix instead. Same suffix, same
 * everything else.
 *
 * Scope (explicitly):
 *  - service_types table only.
 *  - Existing line_items keep their snapshotted descriptions (NOT touched).
 *  - Pending line_item_requests are NOT touched. Pre-flight reports the count
 *    so the operator can see if any pending requests still reference the old
 *    names — if any are still pending and get approved AFTER this rename
 *    without the admin overriding the description on approval, the line item
 *    request approval flow will resurrect a "Truck Hire — …" row in the
 *    catalog. Decide per-platform whether to approve/reject those before
 *    running this. Default behavior: report only, no write.
 *
 * Pre-flight (always runs):
 *  - Counts service_types rows per platform that match "Truck Hire — %".
 *  - Collision check: ensures no row already exists with the would-be new name.
 *  - Reports count of active line_items snapshotted with the old prefix
 *    (informational; not modified).
 *  - Reports count of REQUESTED line_item_requests with the old prefix
 *    (informational warning; not modified).
 *
 * Run:
 *   APP_ENV=staging bunx tsx src/db/scripts/rename-truck-hire-to-transport.ts --dry-run
 *   APP_ENV=staging bunx tsx src/db/scripts/rename-truck-hire-to-transport.ts
 *   APP_ENV=production bunx tsx src/db/scripts/rename-truck-hire-to-transport.ts --dry-run
 *   APP_ENV=production bunx tsx src/db/scripts/rename-truck-hire-to-transport.ts
 */

import "dotenv/config";
import { and, eq, like, sql } from "drizzle-orm";

import { db } from "..";
import { assertAppEnv } from "../safety/guards";
import { lineItemRequests, lineItems, platforms, serviceTypes } from "../schema";

assertAppEnv(["staging", "production"]);

const DRY_RUN = process.argv.includes("--dry-run");

const OLD_PREFIX = "Truck Hire — ";
const NEW_PREFIX = "Transport — ";

const renameName = (oldName: string) => NEW_PREFIX + oldName.slice(OLD_PREFIX.length);

async function main() {
    console.log("🔁 Renaming service_types: 'Truck Hire — …' → 'Transport — …'");
    console.log(`    MODE: ${DRY_RUN ? "--dry-run (no DB writes)" : "LIVE (will write)"}`);

    const allPlatforms = await db
        .select({ id: platforms.id, name: platforms.name })
        .from(platforms);

    if (allPlatforms.length === 0) {
        console.log("⚠️  No platforms found — nothing to do.");
        process.exit(0);
    }

    let totalRenamed = 0;
    let abortedDueToCollision = false;

    for (const platform of allPlatforms) {
        console.log(`\n  Platform: ${platform.name} (${platform.id})`);

        // 1. Find candidates
        const candidates = await db
            .select({ id: serviceTypes.id, name: serviceTypes.name })
            .from(serviceTypes)
            .where(
                and(
                    eq(serviceTypes.platform_id, platform.id),
                    like(serviceTypes.name, `${OLD_PREFIX}%`)
                )
            );

        if (candidates.length === 0) {
            console.log(`    ↳ no rows match — skipping.`);
            continue;
        }

        console.log(`    ↳ ${candidates.length} candidate row(s) to rename:`);
        for (const c of candidates) {
            console.log(`        • ${c.name}  →  ${renameName(c.name)}`);
        }

        // 2. Collision check — is the would-be new name already taken on this platform?
        const wouldBeNewNames = candidates.map((c) => renameName(c.name));
        const collisions = await db
            .select({ id: serviceTypes.id, name: serviceTypes.name })
            .from(serviceTypes)
            .where(
                and(
                    eq(serviceTypes.platform_id, platform.id),
                    sql`${serviceTypes.name} = ANY(${wouldBeNewNames})`
                )
            );

        if (collisions.length > 0) {
            console.log(
                `    ❌ COLLISION: ${collisions.length} existing row(s) already use the target name(s):`
            );
            for (const c of collisions) {
                console.log(`        • ${c.name}`);
            }
            console.log(`    Skipping this platform. Resolve collisions before rerunning.`);
            abortedDueToCollision = true;
            continue;
        }

        // 3. Snapshot impact (read-only): line_items already snapshot the old name.
        const snapshottedLineItems = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(lineItems)
            .where(
                and(
                    eq(lineItems.platform_id, platform.id),
                    like(lineItems.description, `${OLD_PREFIX}%`),
                    eq(lineItems.is_voided, false)
                )
            );
        const snapshotCount = snapshottedLineItems[0]?.count ?? 0;
        console.log(
            `    ℹ️  ${snapshotCount} active line_item(s) snapshotted with old prefix — NOT modified.`
        );

        // 4. Pending line_item_requests warning (read-only): admin approval flow
        //    will resurrect the old name in the catalog if any of these are
        //    approved without the admin overriding description on approval.
        const pendingReqs = await db
            .select({
                id: lineItemRequests.id,
                line_item_request_id: lineItemRequests.line_item_request_id,
                description: lineItemRequests.description,
            })
            .from(lineItemRequests)
            .where(
                and(
                    eq(lineItemRequests.platform_id, platform.id),
                    eq(lineItemRequests.status, "REQUESTED"),
                    like(lineItemRequests.description, `${OLD_PREFIX}%`)
                )
            );

        if (pendingReqs.length > 0) {
            console.log(
                `    ⚠️  ${pendingReqs.length} REQUESTED line_item_request(s) still reference the old prefix:`
            );
            for (const r of pendingReqs) {
                console.log(`        • ${r.line_item_request_id} — "${r.description}"`);
            }
            console.log(
                `        If approved AFTER rename WITHOUT admin overriding description on approval,`
            );
            console.log(
                `        the line-item-request flow will INSERT a fresh "Truck Hire — …" row in the catalog.`
            );
            console.log(
                `        Mitigation: resolve / reject these manually before approving, OR override the`
            );
            console.log(`        description field on the approval modal.`);
        } else {
            console.log(`    ✅ no pending line_item_requests with old prefix.`);
        }

        // 5. Apply (or skip on dry-run)
        if (DRY_RUN) {
            console.log(`    [dry-run] WOULD rename ${candidates.length} row(s) on this platform.`);
            continue;
        }

        // Live path — single transaction per platform.
        await db.transaction(async (tx) => {
            for (const c of candidates) {
                const newName = renameName(c.name);
                await tx
                    .update(serviceTypes)
                    .set({ name: newName, updated_at: new Date() })
                    .where(eq(serviceTypes.id, c.id));
            }
        });

        console.log(`    ✅ renamed ${candidates.length} row(s) on this platform.`);
        totalRenamed += candidates.length;
    }

    if (DRY_RUN) {
        console.log("\n✅ Dry run complete. No changes written.");
    } else {
        console.log(`\n✅ Done. Total rows renamed across all platforms: ${totalRenamed}.`);
        if (abortedDueToCollision) {
            console.log(
                `⚠️  At least one platform was skipped due to name collisions — see logs above.`
            );
            process.exit(2);
        }
    }
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Rename failed:", err);
    process.exit(1);
});
