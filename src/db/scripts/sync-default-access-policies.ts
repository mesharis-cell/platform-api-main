/**
 * Sync default access policies — re-aligns the DB policy rows for
 * ADMIN_DEFAULT / LOGISTICS_DEFAULT / CLIENT_DEFAULT with the current
 * PERMISSION_TEMPLATES.* arrays in code.
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
 *   For each platform + each of the 3 default codes, replace
 *   policies.permissions with the current template. Only touches rows
 *   where code IN ('ADMIN_DEFAULT','LOGISTICS_DEFAULT','CLIENT_DEFAULT'),
 *   leaves custom policies alone.
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

const arraysEqual = (a: string[], b: string[]) => {
    const na = normalize(a);
    const nb = normalize(b);
    if (na.length !== nb.length) return false;
    return na.every((x, i) => x === nb[i]);
};

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
        const desired = normalize(template.permissions as string[]);

        if (arraysEqual(current, desired)) {
            console.log(
                `  ✓ ${row.code} (${row.platform_id}): already up-to-date (${current.length} perms)`
            );
            skipped++;
            continue;
        }

        const missing = desired.filter((p) => !current.includes(p));
        const extra = current.filter((p) => !desired.includes(p));

        console.log(`\n  ↻ ${row.code} (${row.platform_id}) — ${row.name}`);
        if (missing.length > 0) {
            console.log(`     + add (${missing.length}):`);
            missing.forEach((p) => console.log(`       + ${p}`));
        }
        if (extra.length > 0) {
            console.log(`     − drop (${extra.length}):`);
            extra.forEach((p) => console.log(`       − ${p}`));
        }

        if (apply) {
            await db
                .update(accessPolicies)
                .set({ permissions: desired, updated_at: new Date() })
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
