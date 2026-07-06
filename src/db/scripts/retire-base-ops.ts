/**
 * Retire BASE_OPS — one-time data close-out for the BASE_OPS removal (Phase 0
 * of the pricing-ledger work).
 *
 * Owner decision 2026-07-06: Base Operations ("Picking & Handling") is removed
 * entirely — the feature is off for all tenants and no longer useful. The engine
 * no longer generates the BASE_OPS SYSTEM line (syncSystemBaseLineItem deleted),
 * so any BASE_OPS `line_items` row still sitting NON-VOIDED is now orphaned: it
 * carries live money into pricing totals but nothing will ever re-sync or void
 * it (rebuild used to auto-void it when the flag was off — that path is gone).
 *
 * Pre-flight (2026-07-06, staging AND prod — identical data): exactly TWO
 * non-voided BASE_OPS rows, both on CANCELLED orders (ORD-20260329-001/002).
 * CANCELLED orders are excluded from every billing report by the inclusion
 * SSOT, so no live money moves. This script simply voids the surviving rows so
 * the ledger is clean; it deliberately does NOT rebuild the parent breakdown
 * (the parents are terminal — a rebuild is pointless and their historical
 * breakdown_lines snapshots are frozen financial records that must stay
 * untouched).
 *
 * Void semantics mirror the old syncSystemBaseLineItem flag-off path exactly:
 *   is_voided = true, voided_at = now, void_reason = "Base operations retired".
 * voided_by is left NULL (system-initiated close-out, no human actor).
 *
 * Idempotent: it only touches rows where is_voided = false. Re-running after an
 * apply finds zero and is a no-op.
 *
 * Usage:
 *   APP_ENV=staging bun run db:ops:retire-base-ops           # dry-run
 *   APP_ENV=staging bun run db:ops:retire-base-ops:apply     # commit
 *   APP_ENV=production bun run db:ops:retire-base-ops:apply  # prod (runbook)
 */

import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { lineItems } from "../schema";
import { assertAppEnv } from "../safety/guards";

assertAppEnv(["staging", "production"]);

const apply = process.argv.includes("--apply");

const main = async () => {
    console.log(`\n🧹 retire-base-ops (${apply ? "APPLY" : "DRY-RUN"})\n`);

    const survivors = await db
        .select({
            id: lineItems.id,
            line_item_id: lineItems.line_item_id,
            platform_id: lineItems.platform_id,
            order_id: lineItems.order_id,
            inbound_request_id: lineItems.inbound_request_id,
            self_pickup_id: lineItems.self_pickup_id,
            service_request_id: lineItems.service_request_id,
            total: lineItems.total,
        })
        .from(lineItems)
        .where(and(eq(lineItems.system_key, "BASE_OPS"), eq(lineItems.is_voided, false)));

    if (survivors.length === 0) {
        console.log("No non-voided BASE_OPS line items found — nothing to do.\n");
        process.exit(0);
    }

    console.log(`Found ${survivors.length} non-voided BASE_OPS line item(s):`);
    for (const row of survivors) {
        const parent =
            row.order_id != null
                ? `ORDER ${row.order_id}`
                : row.inbound_request_id != null
                  ? `INBOUND_REQUEST ${row.inbound_request_id}`
                  : row.self_pickup_id != null
                    ? `SELF_PICKUP ${row.self_pickup_id}`
                    : row.service_request_id != null
                      ? `SERVICE_REQUEST ${row.service_request_id}`
                      : "UNLINKED";
        console.log(`  ${row.line_item_id} (total ${row.total}) → ${parent}`);
    }

    if (apply) {
        const result = await db
            .update(lineItems)
            .set({
                is_voided: true,
                voided_at: new Date(),
                voided_by: null,
                void_reason: "Base operations retired",
                updated_at: new Date(),
            })
            .where(and(eq(lineItems.system_key, "BASE_OPS"), eq(lineItems.is_voided, false)))
            .returning({ id: lineItems.id });
        console.log(`\n✓ Voided ${result.length} BASE_OPS line item(s).`);
        console.log("  (No breakdown rebuild — parents are terminal; snapshots stay frozen.)\n");
    } else {
        console.log(
            `\n${survivors.length} row(s) WOULD be voided — re-run with :apply to commit.\n`
        );
    }

    process.exit(0);
};

main().catch((err) => {
    console.error("❌ retire-base-ops failed:", err);
    process.exit(1);
});
