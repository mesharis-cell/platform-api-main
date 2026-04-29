/**
 * Backfill historical WRITE_OFF rows that were ad-hoc removals (no live
 * booking) into the new OUTBOUND_AD_HOC movement type.
 *
 * Migration 0053 runs the bulk UPDATE inline at apply time. This script is
 * a belt-and-braces tool for ops to:
 *   - dry-run the candidate list before/after the migration to confirm shape
 *   - clean up any residual rows added between migration apply and FE deploy
 *     (the manual dialog still emits WRITE_OFF until PR-6's FE lands; under
 *      PR-6 the FE reroutes to OUTBOUND_AD_HOC)
 *
 * Heuristic: settlement WRITE_OFFs are fired by the inbound-scan flow which
 * always sets linked_entity_id. So any WRITE_OFF row with NULL link is by
 * construction a manual ad-hoc that should be relabelled.
 *
 * Idempotent — re-running finds 0 candidates after first apply.
 *
 * Run:
 *   APP_ENV=staging bun run stock-movements:backfill:dry
 *   APP_ENV=staging bun run stock-movements:backfill:apply
 *   (production: same with APP_ENV=production)
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pool } from "../index";
import { assertAppEnv } from "../safety/guards";
import { stockMovements } from "../schema";

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
    assertAppEnv(["staging", "production"]);
    const dryRun = hasFlag("dry-run");

    console.log(`\n=== Backfill stock_movements: WRITE_OFF (no link) → OUTBOUND_AD_HOC ===`);
    console.log(`Mode: ${dryRun ? "DRY-RUN" : "APPLY"}\n`);

    // 1. Fetch candidates for inspection.
    const candidates = await db
        .select({
            id: stockMovements.id,
            asset_id: stockMovements.asset_id,
            delta: stockMovements.delta,
            write_off_reason: stockMovements.write_off_reason,
            note: stockMovements.note,
            created_by: stockMovements.created_by,
            created_at: stockMovements.created_at,
        })
        .from(stockMovements)
        .where(
            and(
                eq(stockMovements.movement_type, "WRITE_OFF"),
                isNull(stockMovements.linked_entity_id)
            )
        );

    console.log(`Candidates found: ${candidates.length}`);

    if (candidates.length === 0) {
        console.log("Nothing to backfill. Exiting.");
        await pool.end();
        return;
    }

    // 2. Print each candidate row so ops can eyeball.
    console.log(`\n  ${"id".padEnd(36)}  ${"delta".padStart(6)}  ${"reason".padEnd(10)}  note`);
    console.log(`  ${"-".repeat(36)}  ${"-".repeat(6)}  ${"-".repeat(10)}  ${"-".repeat(40)}`);
    for (const c of candidates) {
        const noteShort = (c.note || "").substring(0, 60).replace(/\n/g, " ");
        console.log(
            `  ${c.id}  ${String(c.delta).padStart(6)}  ${(c.write_off_reason || "—").padEnd(10)}  ${noteShort}`
        );
    }

    if (dryRun) {
        console.log(`\n(dry-run — no rows written)\n`);
        await pool.end();
        return;
    }

    // 3. Apply the relabel inside a single transaction so it's atomic.
    const result = await db.transaction(async (tx) => {
        const updated = await tx
            .update(stockMovements)
            .set({ movement_type: "OUTBOUND_AD_HOC" })
            .where(
                and(
                    eq(stockMovements.movement_type, "WRITE_OFF"),
                    isNull(stockMovements.linked_entity_id)
                )
            )
            .returning({ id: stockMovements.id });
        return updated;
    });

    console.log(`\n✅ Relabelled ${result.length} rows.\n`);
    console.log(
        `Note: this only changes movement_type. The historical asset quantity deltas are unchanged — those rows already represent the operator's recorded action. The new label gives the ledger semantically correct intent for reports/audit.\n`
    );

    await pool.end();
}

main().catch((err) => {
    console.error(`\n❌ Backfill failed:`, err);
    process.exitCode = 1;
    pool.end().catch(() => {});
});

// Reference unused imports for tooling — sql + assets aren't used directly
// here but match the pattern in backfill-pre-confirmed-bookings.ts and may
// be needed if this script grows.
void sql;
