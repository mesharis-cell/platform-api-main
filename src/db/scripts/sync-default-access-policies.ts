/**
 * Sync default access policies — ADDITIVE ONLY.
 *
 * Re-aligns the DB policy rows for ADMIN_DEFAULT / LOGISTICS_DEFAULT /
 * CLIENT_DEFAULT by UNIONING the current PERMISSION_TEMPLATES.* arrays
 * INTO the existing DB `permissions` array. Never removes a permission
 * the DB row already has — respects operator revocations/customizations.
 *
 * Why this exists:
 *   createDefaultAccessPolicies() in platform-bootstrap.service.ts only
 *   INSERTs policies that don't already exist — it never updates the
 *   `permissions` array on existing rows. So when a permission is added
 *   to a template in code, every existing default policy in every
 *   platform remains frozen on its original snapshot. New users assigned
 *   to the default policy inherit the stale snapshot and silently miss
 *   the new permission.
 *
 * What this does:
 *   For each platform + each of the 3 default codes, compute the union
 *   of (DB permissions ∪ template permissions) and write it back. Any
 *   permission the operator has removed from the default via the UI
 *   stays removed ONLY IF the template doesn't mention it — if the
 *   template lists a permission the DB row lacks, it gets re-added.
 *   That's the intended semantic: the template is the floor, not the
 *   ceiling.
 *
 *   Only touches rows where code IN ('ADMIN_DEFAULT','LOGISTICS_DEFAULT',
 *   'CLIENT_DEFAULT'). Leaves custom policies alone.
 *
 * Usage:
 *   APP_ENV=staging bun run db:access:sync-defaults           # dry-run
 *   APP_ENV=staging bun run db:access:sync-defaults:apply     # commit
 *   APP_ENV=production bun run db:access:sync-defaults:apply  # prod
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "../index";
import { accessPolicies } from "../schema";
import { DEFAULT_ACCESS_POLICIES } from "../../app/utils/access-policy";
import { assertAppEnv } from "../safety/guards";

assertAppEnv(["staging", "production"]);

const apply = process.argv.includes("--apply");

const normalize = (list: string[] | null | undefined) =>
    [...new Set(list ?? [])].sort((a, b) => a.localeCompare(b));

const main = async () => {
    console.log(`\n🔄 sync-default-access-policies (${apply ? "APPLY" : "DRY-RUN"})\n`);

    const rows = await db
        .select({
            id: accessPolicies.id,
            platform_id: accessPolicies.platform_id,
            code: accessPolicies.code,
            name: accessPolicies.name,
            permissions: accessPolicies.permissions,
        })
        .from(accessPolicies)
        .where(
            inArray(
                accessPolicies.code,
                DEFAULT_ACCESS_POLICIES.map((p) => p.code)
            )
        );

    if (rows.length === 0) {
        console.log("No default policy rows found. Nothing to sync.");
        return;
    }

    let touched = 0;
    let skipped = 0;

    for (const row of rows) {
        const template = DEFAULT_ACCESS_POLICIES.find((p) => p.code === row.code);
        if (!template) {
            console.log(`  ⊘ ${row.code} (${row.platform_id}): no matching template — skip`);
            skipped++;
            continue;
        }

        const current = normalize(row.permissions as string[] | null);
        const templatePerms = normalize(template.permissions as string[]);
        const missing = templatePerms.filter((p) => !current.includes(p));

        if (missing.length === 0) {
            console.log(
                `  ✓ ${row.code} (${row.platform_id}): already includes every template permission (${current.length} total)`
            );
            skipped++;
            continue;
        }

        // Additive: union of DB + template. Anything the operator removed
        // from the DB row stays removed as long as the template hasn't
        // added it since. Permissions the DB row has that the template
        // doesn't mention are preserved entirely.
        const union = normalize([...current, ...missing]);
        const preservedCustom = current.filter((p) => !templatePerms.includes(p));

        console.log(`\n  ↻ ${row.code} (${row.platform_id}) — ${row.name}`);
        console.log(
            `     ${current.length} → ${union.length} perms (+${missing.length}, preserved ${preservedCustom.length} non-template custom)`
        );
        console.log(`     + add (${missing.length}):`);
        missing.forEach((p) => console.log(`       + ${p}`));

        if (apply) {
            await db
                .update(accessPolicies)
                .set({ permissions: union, updated_at: new Date() })
                .where(eq(accessPolicies.id, row.id));
            console.log(`     ✓ updated`);
        }

        touched++;
    }

    console.log(
        `\n${apply ? "Applied" : "Would update"} ${touched} row(s). Skipped ${skipped} (already in sync).`
    );
    if (!apply && touched > 0) {
        console.log(`\nDry-run only. Re-run with \`--apply\` (via the :apply script) to commit.`);
    }
};

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ sync-default-access-policies failed:", err);
        process.exit(1);
    });
