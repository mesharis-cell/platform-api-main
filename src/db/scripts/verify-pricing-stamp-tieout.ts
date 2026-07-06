/**
 * Pricing-stamp tie-out harness — Phase 1 of the pricing-ledger work (P1-2b).
 *
 * READ-ONLY. For every entity that has a `prices` row, this recomputes the
 * breakdown TOTALS via the CURRENT engine code (PricingService.recompute-
 * TotalsForTieout — the same buildBreakdownLinesFromLineItems + calculate-
 * BreakdownTotals path a real rebuild uses) and diffs the result against the
 * totals implied by the STORED `breakdown_lines` snapshot. Any entity whose
 * sell_total / vat_amount / sell_total_with_vat (or buy_total) drifts by more
 * than 0.01 is reported with its ids, and the script exits non-zero.
 *
 * Why this exists: migration 0072 stamps an explicit `sell_unit_rate` on every
 * BILLABLE line so the engine can move from the old total-level margin math
 * (sell = round(buy_total × (1+margin))) to the ledger model (sell =
 * round(qty × sell_unit_rate)). This harness is the gate that proves the
 * stamping is value-preserving: run it BEFORE 0072 (defensive path exercised),
 * then AFTER 0072 (must be clean apart from documented terminal-entity deltas).
 *
 * Known / expected deltas (NOT a stamping bug — see PROGRESS.md Phase 1 log):
 *   - Terminal orders whose historical total-level-rounded sell cannot be
 *     represented as qty × a 2-decimal per-unit rate (e.g. qty 3 × 798.61 @
 *     20% → stored 2875.00 vs ledger 2874.99). Inherent to the ledger model;
 *     the order is terminal so no live money moves and the frozen snapshot is
 *     never re-stamped.
 *   - Cancelled orders whose frozen snapshot still contains a BASE_OPS line
 *     that Phase 0's retire-base-ops voided WITHOUT rebuilding (snapshot minus
 *     the now-voided line ⇒ recompute is lower by the BASE_OPS amount).
 * The harness prints enough context (ids, human ids, status, stored vs
 * recomputed) to classify each diff by hand against that list.
 *
 * Usage:
 *   APP_ENV=staging    bun run db:ops:pricing-tieout
 *   APP_ENV=production bun run db:ops:pricing-tieout   # pre-merge, on prod
 */

import { eq } from "drizzle-orm";
import { db } from "../index";
import { inboundRequests, orders, prices, selfPickups, serviceRequests } from "../schema";
import { assertAppEnv } from "../safety/guards";
import { PricingService, type PricedEntityType } from "../../app/services/pricing.service";

assertAppEnv(["staging", "production"]);

const TOLERANCE = 0.01;

const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

type EntityMeta = { human_id: string | null; status: string | null };

// Resolve a human-readable id + status for context in the diff report. Kept
// entity-agnostic; failures fall back to nulls (never blocks the tie-out).
const loadEntityMeta = async (
    entityType: PricedEntityType,
    entityId: string
): Promise<EntityMeta> => {
    try {
        if (entityType === "ORDER") {
            const [r] = await db
                .select({ human_id: orders.order_id, status: orders.order_status })
                .from(orders)
                .where(eq(orders.id, entityId))
                .limit(1);
            return { human_id: r?.human_id ?? null, status: r?.status ?? null };
        }
        if (entityType === "SELF_PICKUP") {
            const [r] = await db
                .select({
                    human_id: selfPickups.self_pickup_id,
                    status: selfPickups.self_pickup_status,
                })
                .from(selfPickups)
                .where(eq(selfPickups.id, entityId))
                .limit(1);
            return { human_id: r?.human_id ?? null, status: r?.status ?? null };
        }
        if (entityType === "INBOUND_REQUEST") {
            const [r] = await db
                .select({ status: inboundRequests.request_status })
                .from(inboundRequests)
                .where(eq(inboundRequests.id, entityId))
                .limit(1);
            return { human_id: null, status: r?.status ?? null };
        }
        const [r] = await db
            .select({ status: serviceRequests.request_status })
            .from(serviceRequests)
            .where(eq(serviceRequests.id, entityId))
            .limit(1);
        return { human_id: null, status: r?.status ?? null };
    } catch {
        return { human_id: null, status: null };
    }
};

const main = async () => {
    console.log(`\n🔎 pricing-stamp tie-out (READ-ONLY)  tolerance=±${TOLERANCE}\n`);

    const priceRows = await db
        .select({
            platform_id: prices.platform_id,
            entity_type: prices.entity_type,
            entity_id: prices.entity_id,
            vat_percent: prices.vat_percent,
            breakdown_lines: prices.breakdown_lines,
        })
        .from(prices);

    console.log(`Loaded ${priceRows.length} prices row(s).\n`);

    let checked = 0;
    let nullRecompute = 0;
    const diffs: Array<{
        entity_type: string;
        entity_id: string;
        human_id: string | null;
        status: string | null;
        field: string;
        stored: number;
        recomputed: number;
        delta: number;
    }> = [];

    for (const row of priceRows) {
        const entityType = row.entity_type as PricedEntityType;
        const entityId = row.entity_id as string;
        const platformId = row.platform_id as string;
        const vatPercent = toNum(row.vat_percent);

        // Stored side: totals implied by the frozen breakdown_lines snapshot.
        const storedLines = PricingService.parseBreakdownLines(row.breakdown_lines);
        const storedTotals = PricingService.calculateBreakdownTotals(storedLines, vatPercent);

        // Recompute side: current engine against current line items.
        const recomputed = await PricingService.recomputeTotalsForTieout({
            entity_type: entityType,
            entity_id: entityId,
            platform_id: platformId,
        });
        if (!recomputed) {
            nullRecompute++;
            continue;
        }
        checked++;

        const fields: Array<{ field: string; stored: number; recomputed: number }> = [
            {
                field: "sell_total",
                stored: storedTotals.sell_total,
                recomputed: recomputed.totals.sell_total,
            },
            {
                field: "vat_amount",
                stored: storedTotals.sell_vat_amount,
                recomputed: recomputed.totals.sell_vat_amount,
            },
            {
                field: "sell_total_with_vat",
                stored: storedTotals.sell_total_with_vat,
                recomputed: recomputed.totals.sell_total_with_vat,
            },
            {
                field: "buy_total",
                stored: storedTotals.buy_total,
                recomputed: recomputed.totals.buy_total,
            },
        ];

        const rowDiffs = fields.filter((f) => Math.abs(f.stored - f.recomputed) > TOLERANCE);
        if (rowDiffs.length > 0) {
            const meta = await loadEntityMeta(entityType, entityId);
            for (const f of rowDiffs) {
                diffs.push({
                    entity_type: entityType,
                    entity_id: entityId,
                    human_id: meta.human_id,
                    status: meta.status,
                    field: f.field,
                    stored: f.stored,
                    recomputed: f.recomputed,
                    delta: Number((f.recomputed - f.stored).toFixed(2)),
                });
            }
        }
    }

    console.log(
        `Checked ${checked} priced entit${checked === 1 ? "y" : "ies"} ` +
            `(skipped ${nullRecompute} with no recompute result).\n`
    );

    if (diffs.length === 0) {
        console.log("✅ ZERO tie-out diffs — every priced entity reconciles within tolerance.\n");
        process.exit(0);
    }

    // Group by entity for a readable report.
    const byEntity = new Map<string, typeof diffs>();
    for (const d of diffs) {
        const key = `${d.entity_type}:${d.entity_id}`;
        if (!byEntity.has(key)) byEntity.set(key, []);
        byEntity.get(key)!.push(d);
    }

    console.log(
        `❌ ${byEntity.size} entit${byEntity.size === 1 ? "y" : "ies"} with tie-out diffs:\n`
    );
    for (const [, list] of byEntity) {
        const head = list[0];
        console.log(
            `  ${head.entity_type} ${head.human_id ?? head.entity_id}` +
                `${head.status ? ` [${head.status}]` : ""}  (${head.entity_id})`
        );
        for (const d of list) {
            console.log(
                `      ${d.field.padEnd(20)} stored=${d.stored.toFixed(2)}  ` +
                    `recomputed=${d.recomputed.toFixed(2)}  Δ=${d.delta > 0 ? "+" : ""}${d.delta.toFixed(2)}`
            );
        }
    }
    console.log(
        `\nReview each against the KNOWN/EXPECTED delta list in this file's header.\n` +
            `Any diff NOT on that list is a stamping/engine regression and must be fixed.\n`
    );
    process.exit(1);
};

main().catch((err) => {
    console.error("❌ pricing-stamp tie-out failed:", err);
    process.exit(1);
});
