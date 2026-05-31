/**
 * Red Bull beverage cans — 5-May physical-count reconciliation.
 *
 * On 04.05.2026 the warehouse physically counted Red Bull cans and the client
 * (Rahul) approved those figures as the opening stock from 5 May. That count was
 * agreed over email but NEVER written into Kadence, so the system still carries
 * the pre-reset transition discrepancy on the high-activity SKUs — it reads HIGH
 * because some OUTBOUND scans were missed during the manual→Kadence cutover.
 *
 * This applies the agreed count as ONE backdated ADJUSTMENT per SKU, dated
 * 04.05.2026 (i.e. BEFORE the 5-May cycle opens), so that:
 *   - the cans stock ledger opens at exactly the figures Rahul approved;
 *   - the correction folds into the OPENING (it sits outside the 5–31 May window)
 *     and so NEVER appears as a client-visible mid-cycle movement row;
 *   - the delta is computed dynamically as (agreed − Kadence's reconstructed
 *     5-May value) so it lands on the target regardless of any per-env drift
 *     between staging and prod.
 *
 * Reconstructed 5-May value = available_quantity − Σ(on-shelf flow on/after
 * 05.05.2026), where the on-shelf flow set is OUTBOUND/INBOUND/ADJUSTMENT/
 * OUTBOUND_AD_HOC — identical to the stock-movements report. So after applying
 * `delta`, the report's opening rewinds to exactly `agreed`.
 *
 * Idempotent: re-running detects the existing correction (by note) and skips.
 * The 5 already-matching SKUs compute delta = 0 and are skipped too.
 *
 * Run (dry-run prints the plan and writes nothing):
 *   APP_ENV=staging    bun --preload ./src/bootstrap/env-preload.ts ./src/db/scripts/redbull-may-reconciliation.ts
 *   APP_ENV=staging    bun --preload ./src/bootstrap/env-preload.ts ./src/db/scripts/redbull-may-reconciliation.ts --apply
 *   APP_ENV=production bun --preload ./src/bootstrap/env-preload.ts ./src/db/scripts/redbull-may-reconciliation.ts            # dry-run on prod first
 *   APP_ENV=production bun --preload ./src/bootstrap/env-preload.ts ./src/db/scripts/redbull-may-reconciliation.ts --apply
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../index";
import { assertAppEnv } from "../safety/guards";

const NOTE = "Physical stock count reconciliation — 5-May approved baseline";
const BACKDATE = "2026-05-04 12:00:00"; // before the 5-May cycle opens → folds into opening
const FLOW_START = "2026-05-05"; // on-shelf flow on/after this is the in-window cycle
const FLOW_TYPES = ["OUTBOUND", "INBOUND", "ADJUSTMENT", "OUTBOUND_AD_HOC"];

// Rahul-approved physical count (04.05.2026). All 9 SKUs are listed; the 5 that
// already match Kadence will compute delta 0 and be skipped — included so the run
// verifies the full set lands on the approved baseline.
const AGREED: Record<string, number> = {
    "Red Bull Energy Drink": 1338,
    "Red Bull Sugar Free Cans": 1772,
    "Red Bull White Edition Cans": 899,
    "Red Bull Red Edition Cans": 1147,
    "Red Bull Berry Edition Cans": 1224,
    "Red Bull Blue Edition": 1457,
    "Red Bull Energy Drink Tetris": 1392,
    "Red Bull Pink Edition Cans": 141,
    "Red Bull Yellow Edition": 1230,
};

const rows = (q: any) => (q as any).rows as any[];
const hasFlag = (n: string) => process.argv.includes(`--${n}`);

async function main() {
    const env = assertAppEnv(["staging", "production"]);
    const apply = hasFlag("apply");
    console.log(
        `\n=== Red Bull 5-May cans reconciliation — ${env.toUpperCase()} — ${apply ? "APPLY" : "DRY-RUN"} ===\n`
    );

    // Resolve the audit actor ONCE (stock_movements.created_by is NOT NULL).
    // Prefer the system user (by SYSTEM_USER_EMAIL); fall back to any super-admin.
    // NB: users.platform_id maps to PG column "platform", and super-admins are not
    // platform-scoped — so we don't filter by platform here.
    let actorId: string | null = null;
    if (apply) {
        const sysEmail = process.env.SYSTEM_USER_EMAIL;
        const actor =
            (sysEmail
                ? rows(
                      await db.execute(sql`SELECT id FROM users WHERE email = ${sysEmail} LIMIT 1`)
                  )[0]
                : undefined) ??
            rows(
                await db.execute(
                    sql`SELECT id FROM users WHERE is_super_admin = true ORDER BY created_at ASC LIMIT 1`
                )
            )[0];
        if (!actor) {
            console.error(
                "No system/super-admin user found to attribute the correction. Aborting."
            );
            process.exit(1);
        }
        actorId = actor.id;
    }

    let toApply = 0;
    let skipped = 0;
    const plan: any[] = [];

    for (const [name, agreed] of Object.entries(AGREED)) {
        const a = rows(
            await db.execute(sql`
SELECT id, platform_id, available_quantity, total_quantity
FROM assets
WHERE group_name = ${name} AND LOWER(category) = 'beverages' AND deleted_at IS NULL
LIMIT 1`)
        )[0];
        if (!a) {
            console.log(`!! ${name}: asset not found — skipping`);
            continue;
        }

        const flow = Number(
            rows(
                await db.execute(sql`
SELECT COALESCE(SUM(delta), 0)::int AS s FROM stock_movements
WHERE asset_id = ${a.id} AND created_at >= ${FLOW_START}
  AND movement_type IN (${sql.join(
      FLOW_TYPES.map((t) => sql`${t}`),
      sql`, `
  )})`)
            )[0].s
        );
        const reconstructed5May = Number(a.available_quantity) - flow;
        const delta = agreed - reconstructed5May;

        const already = rows(
            await db.execute(sql`
SELECT id FROM stock_movements WHERE asset_id = ${a.id} AND note = ${NOTE} AND movement_type = 'ADJUSTMENT' LIMIT 1`)
        );

        const status = already.length
            ? "already-applied"
            : delta === 0
              ? "no-op (matches)"
              : "WILL APPLY";
        plan.push({
            name,
            avail: Number(a.available_quantity),
            recon: reconstructed5May,
            agreed,
            delta,
            status,
        });

        if (already.length || delta === 0) {
            skipped++;
            continue;
        }
        toApply++;

        if (apply) {
            await db.execute(sql`
INSERT INTO stock_movements (id, platform_id, asset_id, asset_family_id, delta, movement_type, note, created_by, created_at)
VALUES (gen_random_uuid(), ${a.platform_id}, ${a.id}, NULL, ${delta}, 'ADJUSTMENT', ${NOTE}, ${actorId}, ${BACKDATE}::timestamp)`);
            await db.execute(sql`
UPDATE assets SET total_quantity = GREATEST(0, total_quantity + ${delta}),
                  available_quantity = GREATEST(0, available_quantity + ${delta})
WHERE id = ${a.id}`);
        }
    }

    console.log("SKU                          avail  recon-5May  agreed   delta   status");
    for (const p of plan)
        console.log(
            `${p.name.padEnd(28)} ${String(p.avail).padStart(5)} ${String(p.recon).padStart(10)} ${String(p.agreed).padStart(7)} ${(p.delta > 0 ? "+" : "") + p.delta}`.padEnd(
                70
            ) + p.status
        );
    console.log(
        `\n${apply ? "Applied" : "Would apply"}: ${toApply}   skipped (matched/already): ${skipped}`
    );
    if (!apply && toApply > 0) console.log(`Re-run with --apply to write the corrections.`);
    await pool.end();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
