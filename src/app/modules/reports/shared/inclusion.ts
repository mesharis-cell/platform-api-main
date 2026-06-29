/**
 * BILLING-layer document inclusion — the SINGLE SOURCE OF TRUTH for "which
 * documents count as live, client-billable charges" across the four commercial
 * entities (ORDER, SERVICE_REQUEST, SELF_PICKUP, INBOUND_REQUEST).
 *
 * This is the BILLING SSOT. It is deliberately SEPARATE from
 * `src/app/availability.core.ts` (the OCCUPANCY SSOT — which statuses still hold
 * inventory). Do NOT import from or couple to availability.core here: occupancy
 * and billing answer different questions and diverge (e.g. a CLOSED order no
 * longer holds inventory but is still billable; a NO_COST self-pickup holds
 * inventory but is not billable). Two concerns, two registries.
 *
 * Two layers of filtering, both exported as composable drizzle `SQL` fragments
 * so each report keeps its OWN query and just imports these — there is NO
 * 4-entity god-builder here:
 *
 *   1. STATUS inclusion — drop the "dead / never-happened" states (DRAFT /
 *      DECLINED / CANCELLED, per entity). Everything SUBMITTED-onward is kept.
 *      → `statusExcludeFragment(colExpr, entity)` + the `*_STATUS_EXCLUDE` arrays.
 *
 *   2. BILLABLE sub-filter — drop documents the client is never charged for
 *      (internal SRs, no-cost self-pickups, not-applicable orders/inbound).
 *      → `billableFilterFragment(alias, entity)`.
 *
 * Status arrays are derived from the live pgEnum values in `src/db/schema.ts`
 * (verified, not memorised). If a value named in the spec doesn't exist in an
 * enum it is simply omitted (SP has no DRAFT; INBOUND has no DRAFT/SUBMITTED;
 * SR operational status has no DECLINED).
 */
import { sql, SQL } from "drizzle-orm";

export type BillingEntity = "ORDER" | "SERVICE_REQUEST" | "SELF_PICKUP" | "INBOUND_REQUEST";

// ─── (a) STATUS exclude sets — the "dead / never-happened" states ────────────
// Everything NOT listed here (SUBMITTED-onward) is INCLUDED. Values match the
// live pgEnums exactly; non-existent values are omitted (noted inline).

/** orderStatusEnum has DRAFT + DECLINED + CANCELLED. */
export const ORDER_STATUS_EXCLUDE = ["DRAFT", "DECLINED", "CANCELLED"] as const;

/** selfPickupStatusEnum has NO DRAFT — only DECLINED + CANCELLED are excluded. */
export const SELF_PICKUP_STATUS_EXCLUDE = ["DECLINED", "CANCELLED"] as const;

/** serviceRequestStatusEnum (operational request_status) has NO DECLINED —
 *  only DRAFT + CANCELLED are excluded. */
export const SERVICE_REQUEST_STATUS_EXCLUDE = ["DRAFT", "CANCELLED"] as const;

/** inboundRequestStatusEnum has NO DRAFT/SUBMITTED — only DECLINED + CANCELLED
 *  are excluded. */
export const INBOUND_REQUEST_STATUS_EXCLUDE = ["DECLINED", "CANCELLED"] as const;

const STATUS_EXCLUDE: Record<BillingEntity, readonly string[]> = {
    ORDER: ORDER_STATUS_EXCLUDE,
    SERVICE_REQUEST: SERVICE_REQUEST_STATUS_EXCLUDE,
    SELF_PICKUP: SELF_PICKUP_STATUS_EXCLUDE,
    INBOUND_REQUEST: INBOUND_REQUEST_STATUS_EXCLUDE,
};

/** Return the exclude-set for an entity (the typed constant, for callers that
 *  want the raw list rather than a SQL fragment). */
export function statusExcludeSet(entity: BillingEntity): readonly string[] {
    return STATUS_EXCLUDE[entity];
}

/**
 * ` AND <statusCol> NOT IN ('DRAFT', ...)` for the given entity. `statusColExpr`
 * is the caller's column reference (e.g. `sql.raw("o.order_status")`,
 * `sql.raw("sp.self_pickup_status")`) so it drops straight into an existing
 * WHERE chain. Leading space + AND so it composes like the other report
 * fragments. Returns empty SQL if the entity has no exclusions (never, today).
 */
export function statusExcludeFragment(statusColExpr: SQL, entity: BillingEntity): SQL {
    const set = STATUS_EXCLUDE[entity];
    if (set.length === 0) return sql``;
    return sql` AND ${statusColExpr} NOT IN (${sql.join(
        set.map((s) => sql`${s}`),
        sql`, `
    )})`;
}

// ─── (b) BILLABLE sub-filter predicates — "is this doc client-billable" ──────
// One predicate per entity, keyed off the column the entity stores its
// billability signal on:
//   ORDER / INBOUND_REQUEST → financial_status <> 'NOT_APPLICABLE'
//   SERVICE_REQUEST         → commercial_status <> 'INTERNAL'
//   SELF_PICKUP             → pricing_mode <> 'NO_COST'

/**
 * ` AND <billable predicate>` for the given entity, scoped to a table alias
 * (e.g. "o", "sr", "sp", "ir"). Mirrors the column refs the reports already use.
 */
export function billableFilterFragment(alias: string, entity: BillingEntity): SQL {
    switch (entity) {
        case "ORDER":
            return sql` AND ${sql.raw(`${alias}.financial_status`)} <> 'NOT_APPLICABLE'`;
        case "INBOUND_REQUEST":
            return sql` AND ${sql.raw(`${alias}.financial_status`)} <> 'NOT_APPLICABLE'`;
        case "SERVICE_REQUEST":
            return sql` AND ${sql.raw(`${alias}.commercial_status`)} <> 'INTERNAL'`;
        case "SELF_PICKUP":
            return sql` AND ${sql.raw(`${alias}.pricing_mode`)} <> 'NO_COST'`;
    }
}
