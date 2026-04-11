/**
 * One-time operational script: backfill SELF_PICKUPS_* and STOCK_MOVEMENTS_*
 * permissions onto existing access policies.
 *
 * New platforms/companies created after this build get these permissions
 * automatically via the updated PERMISSION_TEMPLATES in permissions.ts.
 * But existing access policies in the DB need to be patched.
 *
 * Run once on staging after migration 0038, then once on prod.
 *
 * Usage:
 *   bunx tsx src/db/scripts/backfill-redbull-build-permissions.ts
 */

import { db } from "..";
import { accessPolicies } from "../schema";
import { eq } from "drizzle-orm";

const SELF_PICKUP_PERMISSIONS_ADMIN = [
    "self_pickups:create",
    "self_pickups:read",
    "self_pickups:approve",
    "self_pickups:cancel",
    "self_pickups:export",
    "self_pickups:view_page",
    "self_pickups:*",
    "stock_movements:read",
    "stock_movements:adjust",
    "stock_movements:view_page",
];

const SELF_PICKUP_PERMISSIONS_LOGISTICS = [
    "self_pickups:create",
    "self_pickups:read",
    "self_pickups:approve",
    "self_pickups:cancel",
    "self_pickups:view_page",
    "stock_movements:read",
    "stock_movements:adjust",
    "stock_movements:view_page",
];

const SELF_PICKUP_PERMISSIONS_CLIENT = [
    "self_pickups:create",
    "self_pickups:read",
    "self_pickups:cancel",
];

async function main() {
    console.log("🔧 Backfilling Red Bull build permissions...\n");

    const allPolicies = await db.select().from(accessPolicies).execute();
    let updated = 0;

    for (const policy of allPolicies) {
        const currentPerms = (policy.permissions as string[]) || [];

        // Skip if already has self_pickups permissions
        if (currentPerms.includes("self_pickups:read")) {
            console.log(`  ⏭ ${policy.name} (${policy.role}) — already has self_pickups perms`);
            continue;
        }

        let newPerms: string[] = [];
        switch (policy.role) {
            case "ADMIN":
                newPerms = SELF_PICKUP_PERMISSIONS_ADMIN;
                break;
            case "LOGISTICS":
                newPerms = SELF_PICKUP_PERMISSIONS_LOGISTICS;
                break;
            case "CLIENT":
                newPerms = SELF_PICKUP_PERMISSIONS_CLIENT;
                break;
            default:
                console.log(`  ⏭ ${policy.name} — unknown role ${policy.role}, skipping`);
                continue;
        }

        const mergedPerms = Array.from(new Set([...currentPerms, ...newPerms])).sort();

        await db
            .update(accessPolicies)
            .set({ permissions: mergedPerms })
            .where(eq(accessPolicies.id, policy.id));

        console.log(
            `  ✅ ${policy.name} (${policy.role}) — added ${newPerms.length} permissions`
        );
        updated++;
    }

    console.log(`\n✅ Done. Updated ${updated} of ${allPolicies.length} policies.`);
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Backfill failed:", err);
    process.exit(1);
});
