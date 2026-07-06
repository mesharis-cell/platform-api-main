/**
 * Strip cancel permissions from LOGISTICS — one-time data fix.
 *
 * Owner decision 2026-07-06: cancelling self-pickups / inbound requests must
 * NOT be a default LOGISTICS capability. The code paths stay (routes accept
 * ADMIN + LOGISTICS, warehouse buttons are permission-gated), but the
 * permission is grant-only: an admin explicitly grants `self_pickups:cancel`
 * or `inbound_requests:cancel` to a specific user/policy when wanted.
 *
 * The template change (PERMISSION_TEMPLATES.LOGISTICS_STAFF no longer lists
 * SELF_PICKUPS_CANCEL; INBOUND_REQUESTS_CANCEL was never listed) only affects
 * NEW policy rows — existing access_policies keep their stored snapshot, and
 * sync-defaults is additive-only so it will never re-add these. This script
 * does the removal side:
 *
 *   1. access_policies with role='LOGISTICS': remove both cancel keys from
 *      the permissions array (default AND custom policies — clean slate).
 *   2. users with role='LOGISTICS': remove both keys from permission_grants
 *      AND permission_revokes (clean slate — nobody granted, nobody revoked).
 *
 * Deliberately untouched: ADMIN policies (they carry `*` wildcards, cancel
 * stays theirs) and CLIENT policies/users (CLIENT_USER keeps
 * self_pickups:cancel — clients cancel their OWN pickups via the client mount).
 *
 * Usage:
 *   APP_ENV=staging bun run db:access:strip-logistics-cancel           # dry-run
 *   APP_ENV=staging bun run db:access:strip-logistics-cancel:apply     # commit
 *   APP_ENV=production bun run db:access:strip-logistics-cancel:apply  # prod
 */

import { eq } from "drizzle-orm";
import { db } from "../index";
import { accessPolicies, users } from "../schema";
import { assertAppEnv } from "../safety/guards";

assertAppEnv(["staging", "production"]);

const apply = process.argv.includes("--apply");

const STRIP_KEYS = ["self_pickups:cancel", "inbound_requests:cancel"];

const without = (list: string[] | null | undefined) =>
    (list ?? []).filter((p) => !STRIP_KEYS.includes(p));

const main = async () => {
    console.log(`\n🔒 strip-logistics-cancel-perms (${apply ? "APPLY" : "DRY-RUN"})\n`);

    // Step 1: LOGISTICS access policies
    const policies = await db
        .select({
            id: accessPolicies.id,
            platform_id: accessPolicies.platform_id,
            code: accessPolicies.code,
            name: accessPolicies.name,
            permissions: accessPolicies.permissions,
        })
        .from(accessPolicies)
        .where(eq(accessPolicies.role, "LOGISTICS"));

    let policyChanges = 0;
    for (const policy of policies) {
        const next = without(policy.permissions);
        if (next.length === policy.permissions.length) continue;
        policyChanges++;
        const removed = policy.permissions.filter((perm) => STRIP_KEYS.includes(perm));
        console.log(
            `  policy ${policy.code} (${policy.name}, platform ${policy.platform_id}): removing [${removed.join(", ")}]`
        );
        if (apply) {
            await db
                .update(accessPolicies)
                .set({ permissions: next })
                .where(eq(accessPolicies.id, policy.id));
        }
    }
    console.log(
        `\n${policyChanges} LOGISTICS policy row(s) ${apply ? "updated" : "would change"}.`
    );

    // Step 2: LOGISTICS user grants/revokes
    const logisticsUsers = await db
        .select({
            id: users.id,
            email: users.email,
            permission_grants: users.permission_grants,
            permission_revokes: users.permission_revokes,
        })
        .from(users)
        .where(eq(users.role, "LOGISTICS"));

    let userChanges = 0;
    for (const user of logisticsUsers) {
        const nextGrants = without(user.permission_grants);
        const nextRevokes = without(user.permission_revokes);
        const grantsChanged = nextGrants.length !== (user.permission_grants ?? []).length;
        const revokesChanged = nextRevokes.length !== (user.permission_revokes ?? []).length;
        if (!grantsChanged && !revokesChanged) continue;
        userChanges++;
        console.log(
            `  user ${user.email}: ${grantsChanged ? "grants" : ""}${grantsChanged && revokesChanged ? "+" : ""}${revokesChanged ? "revokes" : ""} cleaned`
        );
        if (apply) {
            await db
                .update(users)
                .set({ permission_grants: nextGrants, permission_revokes: nextRevokes })
                .where(eq(users.id, user.id));
        }
    }
    console.log(`${userChanges} LOGISTICS user(s) ${apply ? "updated" : "would change"}.`);

    if (!apply) console.log("\nDry-run only — re-run with :apply to commit.");
    process.exit(0);
};

main().catch((err) => {
    console.error("❌ strip-logistics-cancel-perms failed:", err);
    process.exit(1);
});
