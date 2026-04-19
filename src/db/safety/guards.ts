/**
 * Unified safety guards for destructive database operations.
 *
 * Consolidates what used to live in three places:
 *   - src/db/scripts/destructive-guard.ts  (allowlist + env-block + typed phrase)
 *   - src/db/test-db-marker.ts             (marker row for test-DB authority)
 *   - inline config.database_url checks     (seed-test.ts, test/setup/lifecycle.ts)
 *
 * Every destructive script imports and calls the guards it needs before any
 * destructive operation. Non-destructive scripts (read-only audits, exports,
 * dry-runs) may skip assertDestructiveOpAllowed but MUST still call
 * assertAppEnv() to confirm they're running against the intended env.
 *
 * Usage pattern (destructive script):
 *
 *   import "../../bootstrap/env";               // must be first — loads env
 *   import { assertAppEnv, assertDestructiveOpAllowed } from "../safety/guards";
 *
 *   assertAppEnv(["staging"]);
 *   await assertDestructiveOpAllowed("SEED");
 *   // ... destructive work ...
 */

import { sql } from "drizzle-orm";
import { db } from "../index";
import { getAppEnv, type AppEnv } from "../../app/constants/app-env";
import { enforceDestructiveDbGuard } from "../scripts/destructive-guard";

export type DestructiveOp = "SEED" | "REBUILD";

export const MARKER_TABLE = "_e2e_test_db_marker";
export const MARKER_ROW_ID = 1;

/**
 * Assert the current APP_ENV is in the allowed list. Throws with a clear
 * error if not. Prevents e.g. `APP_ENV=production bun run db:rebuild` from
 * progressing past the first line.
 */
export const assertAppEnv = (allowed: readonly AppEnv[]): AppEnv => {
    const current = getAppEnv();
    if (!allowed.includes(current)) {
        throw new Error(
            `[guard] APP_ENV=${current} is not allowed for this operation. ` +
                `Allowed: [${allowed.join(", ")}]. ` +
                `Run with \`APP_ENV=${allowed[0]} bun run <script>\` if appropriate.`
        );
    }
    return current;
};

/**
 * Returns true if the test-DB marker row exists. Used by assertIsTestDatabase()
 * for the assertion path and by bootstrap-test-db.ts for the branching path
 * (no-op if already bootstrapped).
 */
export const markerRowExists = async (): Promise<boolean> => {
    try {
        const result: any = await db.execute(
            sql.raw(`SELECT id FROM "${MARKER_TABLE}" WHERE id = ${MARKER_ROW_ID} LIMIT 1`)
        );
        const rows = result?.rows ?? result ?? [];
        return Array.isArray(rows) ? rows.length > 0 : false;
    } catch {
        return false;
    }
};

/**
 * Assert the current DB is a Kadence E2E testing database (has the marker row).
 *
 * The marker is written only by `db:bootstrap:test`, which is itself gated by
 * destructive-guard (Supabase-ref allowlist + typed `REBUILD <ref>` phrase).
 * So the marker's presence is strong evidence the DB was intentionally
 * authorized for wiping — marking the wrong DB requires three deliberate,
 * target-named human actions.
 */
export const assertIsTestDatabase = async (): Promise<void> => {
    if (await markerRowExists()) return;

    throw new Error(
        `[guard] Refusing destructive op: marker row ${MARKER_ROW_ID} in "${MARKER_TABLE}" is missing. ` +
            `This database has never been authorized as a Kadence E2E testing database. ` +
            `Run \`bun run db:bootstrap:test\` against it — that is the only authorized path ` +
            `to create the marker, and it is gated by the existing destructive-guard (Supabase-ref ` +
            `allowlist + typed confirmation phrase).`
    );
};

/**
 * Run the allowlist + env-block + typed-confirmation flow for destructive ops
 * on staging/production-class databases. Delegates to the existing
 * enforceDestructiveDbGuard implementation.
 *
 * Flow:
 *   1. DB_DESTRUCTIVE_BLOCKED_ENVS check (defaults block production)
 *   2. DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS / _HOSTS check
 *   3. Typed confirmation phrase (TTY prompt or DB_DESTRUCTIVE_CONFIRM env var)
 */
export const assertDestructiveOpAllowed = async (op: DestructiveOp): Promise<void> => {
    await enforceDestructiveDbGuard(op.toLowerCase() as "seed" | "rebuild");
};
