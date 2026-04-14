/**
 * One-time bootstrap for the E2E testing database.
 *
 * Writes the `_e2e_test_db_marker` row that `src/db/test-db-marker.ts`
 * checks before every destructive op (wipe, seed, truncate). Running this
 * script is the ONLY authorized way to create the marker.
 *
 * What this script does, in order (only on first run — subsequent runs are no-ops):
 *   1. Verifies the marker is missing (if present, we already bootstrapped → exit).
 *   2. Runs `enforceDestructiveDbGuard("rebuild")` — Supabase-ref allowlist +
 *      typed confirmation phrase `REBUILD <project-ref>`.
 *   3. Drops and recreates the public schema (the Drizzle migration chain is
 *      known-broken per CLAUDE.md gotcha #41; `drizzle-kit push --force`
 *      applies the current schema.ts directly, skipping migration history).
 *   4. Applies the current schema via `drizzle-kit push --force`.
 *   5. Writes the `_e2e_test_db_marker` row.
 *
 * Safety chain:
 *   - Marker already exists → no schema drop, no prompt, exit 0.
 *   - Marker missing + APP_ENV=production → destructive-guard refuses.
 *   - Marker missing + target not in DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS → refused.
 *   - Marker missing + no confirmation phrase → refused (requires DB_DESTRUCTIVE_CONFIRM
 *     for non-TTY, or typed input in a terminal).
 *
 * Usage:
 *   # First, set allowlist for your test DB in .env:
 *   DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS=your-test-project-ref
 *
 *   # For non-TTY (CI, agent shells), also set:
 *   DB_DESTRUCTIVE_CONFIRM=REBUILD your-test-project-ref
 *
 *   bun run db:bootstrap:test
 */

// ENV MUST be loaded via `bun --preload ./src/bootstrap/env-preload.ts` before
// this module loads. ES module hoisting means inline env overrides run AFTER
// imports, too late to affect the shared db pool's connection string.
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { db } from "../index";
import { enforceDestructiveDbGuard } from "./destructive-guard";
import { runCommand } from "./process.utils";
import { assertAppEnv, markerRowExists, MARKER_TABLE, MARKER_ROW_ID } from "../safety/guards";

// Fail fast if APP_ENV isn't "testing". The allowlist + typed-confirmation
// in enforceDestructiveDbGuard("rebuild") is the second, stronger gate for
// schema wipe — this assertion just ensures we're in the right env first.
assertAppEnv(["testing"]);

const databaseUrlTest = process.env.DATABASE_URL;
if (!databaseUrlTest) {
    throw new Error(
        "DATABASE_URL is not set. Env preload likely did not run. Ensure " +
            "`--preload ./src/bootstrap/env-preload.ts` is on the bun command (see package.json)."
    );
}

const MARKER_NOTE = "Kadence E2E testing database — managed by db:bootstrap:test";

const wipePublicSchema = async (): Promise<void> => {
    const client = new Client({ connectionString: databaseUrlTest });
    await client.connect();
    try {
        await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    } finally {
        await client.end();
    }
};

const writeMarker = async () => {
    await db.execute(
        sql.raw(`
            CREATE TABLE IF NOT EXISTS "${MARKER_TABLE}" (
                id int PRIMARY KEY,
                created_at timestamptz NOT NULL DEFAULT now(),
                note text NOT NULL
            )
        `)
    );
    await db.execute(
        sql.raw(`
            INSERT INTO "${MARKER_TABLE}" (id, note)
            VALUES (${MARKER_ROW_ID}, '${MARKER_NOTE.replace(/'/g, "''")}')
            ON CONFLICT (id) DO NOTHING
        `)
    );
};

const main = async () => {
    if (await markerRowExists()) {
        console.log(
            `✓ Test DB already bootstrapped (marker row ${MARKER_ROW_ID} exists in ${MARKER_TABLE}). No-op.`
        );
        process.exit(0);
    }

    console.log("Test DB marker missing. Running destructive-guard confirmation...\n");
    await enforceDestructiveDbGuard("rebuild");

    console.log("\n🧹 Dropping and recreating public schema on the test DB...");
    await wipePublicSchema();

    console.log("🧱 Applying current schema via drizzle-kit push...");
    await runCommand("bunx", ["drizzle-kit", "push", "--force"]);

    console.log(`\n🔒 Writing marker row to ${MARKER_TABLE}...`);
    await writeMarker();

    console.log(
        `\n✓ Test DB bootstrapped. You can now run \`bun run db:seed:test\` and \`bun run test:e2e\`.`
    );
    process.exit(0);
};

main().catch((err) => {
    console.error("❌ Bootstrap failed:", err instanceof Error ? err.message : err);
    process.exit(1);
});
