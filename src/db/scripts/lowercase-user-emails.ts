/**
 * LOWERCASE USER EMAILS
 *
 * One-shot remediation for case-sensitivity bug in auth: rewrites all user
 * emails on a given (platform, company) to lowercase in a single transaction.
 *
 * This is a workaround until the auth service normalizes email lookup. Once
 * the rows are lowercase, users only need to type their email in lowercase
 * and login will succeed.
 *
 * USE WITH CARE — pre-checks for case-only duplicates that would collide on
 * the unique index (platform_id, email) and aborts before writing if found.
 *
 * Run:
 *   bunx tsx src/db/scripts/lowercase-user-emails.ts --platform kadence.ae --company pernod-ricard --dry-run
 *   bunx tsx src/db/scripts/lowercase-user-emails.ts --platform kadence.ae --company pernod-ricard
 */

import "dotenv/config";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, pool } from "../index";
import * as schema from "../schema";

const getArg = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
    const platformDomain = getArg("platform");
    const companyDomain = getArg("company");
    const dryRun = hasFlag("dry-run");

    if (!platformDomain || !companyDomain) {
        throw new Error(
            "Usage: bunx tsx src/db/scripts/lowercase-user-emails.ts " +
                "--platform <domain> --company <domain> [--dry-run]"
        );
    }

    const platform = await db.query.platforms.findFirst({
        where: eq(schema.platforms.domain, platformDomain),
    });
    if (!platform) throw new Error(`Platform not found: ${platformDomain}`);

    const company = await db.query.companies.findFirst({
        where: and(
            eq(schema.companies.platform_id, platform.id),
            eq(schema.companies.domain, companyDomain),
            isNull(schema.companies.deleted_at)
        ),
    });
    if (!company) {
        throw new Error(
            `No active company with domain "${companyDomain}" on platform "${platform.domain}"`
        );
    }

    const targets = await db.query.users.findMany({
        where: and(
            eq(schema.users.platform_id, platform.id),
            eq(schema.users.company_id, company.id)
        ),
        columns: { id: true, email: true, name: true },
    });

    const needsChange = targets.filter((u) => u.email !== u.email.toLowerCase());
    if (needsChange.length === 0) {
        console.log(`✓ nothing to do — all ${targets.length} user emails already lowercase`);
        return;
    }

    // Pre-flight: detect case-only collisions that would violate the
    // (platform_id, email) unique index after we lowercase.
    const allEmailsLower = new Map<string, string[]>();
    for (const u of targets) {
        const k = u.email.toLowerCase();
        const list = allEmailsLower.get(k) ?? [];
        list.push(u.email);
        allEmailsLower.set(k, list);
    }
    const collisions = [...allEmailsLower.entries()].filter(([, v]) => v.length > 1);
    if (collisions.length > 0) {
        const detail = collisions
            .map(([lower, originals]) => `  ${lower} ← ${originals.join(", ")}`)
            .join("\n");
        throw new Error(
            `Refusing to proceed — case-only duplicates within (platform, company) would collide on lowercasing:\n${detail}\n` +
                `Resolve manually first.`
        );
    }

    // Also check there is no OTHER user on the same platform (different
    // company, or null company) whose email already matches the lowercased
    // form — that would also collide on the platform-wide unique index.
    const lowerForms = needsChange.map((u) => u.email.toLowerCase());
    const targetIds = new Set(needsChange.map((u) => u.id));
    const platformWideMatches = await db.query.users.findMany({
        where: and(
            eq(schema.users.platform_id, platform.id),
            inArray(schema.users.email, lowerForms)
        ),
        columns: { id: true, email: true, company_id: true },
    });
    const externalCollisions = platformWideMatches.filter((u) => !targetIds.has(u.id));
    if (externalCollisions.length > 0) {
        const detail = externalCollisions
            .map((u) => `  ${u.email} (user ${u.id}, company ${u.company_id ?? "null"})`)
            .join("\n");
        throw new Error(
            `Refusing to proceed — lowercased emails already exist for OTHER users on this platform:\n${detail}\n` +
                `Resolve manually first.`
        );
    }

    console.log(
        `Will lowercase ${needsChange.length} email(s) on platform "${platform.domain}", company "${company.domain}":`
    );
    for (const u of needsChange) {
        console.log(`  ${u.email}  →  ${u.email.toLowerCase()}   (${u.name})`);
    }

    if (dryRun) {
        console.log("(dry-run — no DB writes)");
        return;
    }

    await db.transaction(async (tx) => {
        for (const u of needsChange) {
            await tx
                .update(schema.users)
                .set({ email: u.email.toLowerCase(), updated_at: sql`now()` })
                .where(eq(schema.users.id, u.id));
        }
    });

    console.log(`✓ updated ${needsChange.length} user(s)`);
}

main()
    .catch((err) => {
        console.error("✗ lowercase-user-emails failed:", err instanceof Error ? err.message : err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
