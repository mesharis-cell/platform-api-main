/**
 * Stock Movements Ledger — pivoted "Cans-Mar" reconciliation ledger for one
 * tenant. Rows are physical-quantity-impacting movement legs (chronological);
 * columns are asset families (assets.group_id + group_name). Anchored by
 * OPENING + CLOSING so finance can sum any column and self-validate via
 * Closing = Opening + Σ(events).
 *
 * Ported from the canonical CLI (src/db/scripts/export-stock-movements.ts) with
 * the spec-appendix "Required fixes" applied:
 *   - REWIND FIX (decided = PHYSICAL ON-HAND): the canonical script anchored on
 *     SUM(available_quantity) and rewound by ALL non-CONSUMED deltas
 *     (OUTBOUND/INBOUND/INITIAL/WRITE_OFF) — wrong, because only ADJUSTMENT +
 *     OUTBOUND_AD_HOC move available_quantity (AVAILABLE_QTY_AFFECTING in
 *     stock-movement.service.ts). Here we anchor on SUM(total_quantity) (the
 *     physical on-hand counter) and rewind / stream ONLY the total-qty-affecting
 *     legs — WRITE_OFF (non-CONSUMED) + ADJUSTMENT + OUTBOUND_AD_HOC — which is
 *     exactly the set that mutates total_quantity (TOTAL_QTY_AFFECTING). The
 *     pure-audit legs (OUTBOUND / INBOUND / INITIAL) move neither counter and
 *     are excluded from the event stream so the on-sheet
 *     Closing = Opening + SUM(events) reconciles against the anchor.
 *   - CONSUMED write-offs dropped from events + rewind + opening, consistently.
 *   - All sql.raw string interpolation re-parameterized to bound placeholders.
 *   - ~50-family column cap enforced (dimension "pivot-columns").
 *
 * No money columns → client-safe; ADMIN_CLIENT.
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import {
    colLetter,
    colourDelta,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    fmtRangeLabel,
    INT_FMT,
    ReportColumn,
    STYLE,
} from "../../../utils/report-workbook";

const FAMILY_CAP = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z.object({
    company_id: z.string().uuid(),
    category: z.string().optional(),
    group: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    date_from: z.string().regex(DATE_RE).optional(),
    date_to: z.string().regex(DATE_RE).optional(),
});

/** Human-readable leg suffix for the Purpose column (mirrors the canonical script). */
function legSuffix(
    movementType: string,
    writeOffReason: string | null,
    outboundAdHocReason: string | null
): string {
    if (movementType === "WRITE_OFF") {
        if (writeOffReason === "LOST") return "LOST";
        if (writeOffReason === "DAMAGED") return "DAMAGED";
        return "WRITE-OFF";
    }
    if (movementType === "OUTBOUND_AD_HOC")
        return outboundAdHocReason ? `AD-HOC OUT (${outboundAdHocReason})` : "AD-HOC OUT";
    if (movementType === "ADJUSTMENT") return "ADJUSTMENT";
    return movementType;
}

type Family = { id: string; name: string; anchorTotal: number; closing: number; opening: number };
type EventRow = {
    sortKey: number;
    date: Date | null;
    requestedBy: string;
    purpose: string;
    deltas: Map<string, number>;
};

/**
 * Physical-on-hand rewind set — the movement types that actually mutate
 * assets.total_quantity (TOTAL_QTY_AFFECTING in stock-movement.service.ts),
 * minus CONSUMED write-offs which are dropped from the whole ledger.
 * Materialized as a SQL predicate so the event-stream, the post-cutoff rewind,
 * and the opening derivation all use IDENTICALLY the same set — the load-bearing
 * condition for Closing = Opening + Σ(events) to reconcile against the anchor.
 */
const PHYSICAL_LEG_FILTER: SQL = sql`(
    sm.movement_type IN ('WRITE_OFF', 'ADJUSTMENT', 'OUTBOUND_AD_HOC')
    AND NOT (sm.movement_type = 'WRITE_OFF' AND sm.write_off_reason = 'CONSUMED')
)`;

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const categoryName: string | undefined = params.category
        ? String(params.category).trim() || undefined
        : undefined;
    const groupIds = toArr(params.group);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);

    // ── Stage 1: resolve pivot families (groups) in scope ────────────────────
    // Scope is include-only (per spec): a SINGLE --category OR an explicit
    // group_id list. Anchor on SUM(total_quantity) — physical on-hand.
    const famScope: SQL[] = [
        sql` AND a.company_id = ${ctx.companyId}`,
        sql` AND a.deleted_at IS NULL`,
        sql` AND a.group_id IS NOT NULL`,
    ];
    if (categoryName) famScope.push(sql` AND LOWER(a.category) = LOWER(${categoryName})`);
    if (groupIds.length)
        famScope.push(
            sql` AND a.group_id IN (${sql.join(
                groupIds.map((g) => sql`${g}`),
                sql`, `
            )})`
        );

    const famQuery = sql`
SELECT
    a.group_id AS id,
    MIN(a.group_name) AS name,
    COALESCE(SUM(a.total_quantity), 0)::int AS anchor_total
FROM assets a
WHERE a.platform_id = ${ctx.platformId}${sql.join(famScope, sql``)}
GROUP BY a.group_id
ORDER BY MIN(a.group_name) ASC`;

    const famRows = ((await db.execute(famQuery)) as any).rows as any[];
    const families: Family[] = famRows.map((r) => ({
        id: String(r.id),
        name: r.name ?? "(unnamed)",
        anchorTotal: Number(r.anchor_total) || 0,
        closing: Number(r.anchor_total) || 0,
        opening: 0,
    }));

    if (families.length === 0)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "No families matched the scope. Provide a --category or --group filter that resolves to live asset groups for this company."
        );
    if (families.length > FAMILY_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Stock ledger has ${families.length} family columns (cap ${FAMILY_CAP}). Narrow by category or group filter.`
        );

    const familyIds = families.map((f) => f.id);
    const famIdSql = sql.join(
        familyIds.map((g) => sql`${g}`),
        sql`, `
    );
    /** A movement maps to an in-scope family via direct asset_family_id OR via assets.group_id (dual link). */
    const famLink = sql`((sm.asset_family_id IN (${famIdSql})) OR (a.group_id IN (${famIdSql})))`;

    // ── Stage 2: pull in-window physical-affecting movement legs ─────────────
    const moveFilters: SQL[] = [sql` AND ${famLink}`, sql` AND ${PHYSICAL_LEG_FILTER}`];
    if (gte) moveFilters.push(sql` AND sm.created_at >= ${gte}`);
    if (lt) moveFilters.push(sql` AND sm.created_at < ${lt}`);

    const movesQuery = sql`
SELECT
    sm.id, sm.created_at, sm.movement_type, sm.write_off_reason, sm.outbound_ad_hoc_reason,
    sm.delta, sm.note, sm.linked_entity_type, sm.linked_entity_id,
    COALESCE(sm.asset_family_id, a.group_id) AS family_id
FROM stock_movements sm
LEFT JOIN assets a ON sm.asset_id = a.id
WHERE sm.platform_id = ${ctx.platformId}${sql.join(moveFilters, sql``)}
ORDER BY sm.created_at ASC`;

    const moves = ((await db.execute(movesQuery)) as any).rows as any[];

    // ── Stage 3: resolve entity refs (orders + SPs) for nice Purpose strings ──
    const orderIds = new Set<string>();
    const spIds = new Set<string>();
    for (const m of moves) {
        if (!m.linked_entity_id) continue;
        if (m.linked_entity_type === "ORDER") orderIds.add(m.linked_entity_id);
        if (m.linked_entity_type === "SELF_PICKUP") spIds.add(m.linked_entity_id);
    }

    const orderInfo = new Map<string, { ref: string; venue: string; user: string | null }>();
    if (orderIds.size > 0) {
        const r = (
            (await db.execute(sql`
SELECT o.id, o.order_id AS ref, o.venue_name AS venue, u.name AS user_name
FROM orders o LEFT JOIN users u ON o.created_by = u.id
WHERE o.id IN (${sql.join(
                [...orderIds].map((i) => sql`${i}`),
                sql`, `
            )})`)) as any
        ).rows as any[];
        for (const x of r)
            orderInfo.set(x.id, { ref: x.ref, venue: x.venue ?? "", user: x.user_name });
    }

    const spInfo = new Map<
        string,
        { ref: string; collector: string | null; user: string | null }
    >();
    if (spIds.size > 0) {
        const r = (
            (await db.execute(sql`
SELECT sp.id, sp.self_pickup_id AS ref, sp.collector_name AS collector, u.name AS user_name
FROM self_pickups sp LEFT JOIN users u ON sp.created_by = u.id
WHERE sp.id IN (${sql.join(
                [...spIds].map((i) => sql`${i}`),
                sql`, `
            )})`)) as any
        ).rows as any[];
        for (const x of r)
            spInfo.set(x.id, { ref: x.ref, collector: x.collector, user: x.user_name });
    }

    // ── Stage 4: collapse movements into legs (one row per entity×leg) ───────
    const groups = new Map<string, EventRow>();
    for (const m of moves) {
        if (!m.family_id) continue; // silent-drop: no asset_family_id AND no sibling group_id

        const legKey =
            m.movement_type === "WRITE_OFF"
                ? `${m.movement_type}:${m.write_off_reason ?? "OTHER"}`
                : m.movement_type === "OUTBOUND_AD_HOC"
                  ? `${m.movement_type}:${m.outbound_ad_hoc_reason ?? "OTHER"}`
                  : m.movement_type;
        const groupKey =
            m.linked_entity_type && m.linked_entity_id
                ? `${m.linked_entity_type}:${m.linked_entity_id}:${legKey}`
                : `MOVEMENT:${m.id}:${legKey}`;

        let g = groups.get(groupKey);
        const leg = legSuffix(m.movement_type, m.write_off_reason, m.outbound_ad_hoc_reason);
        if (!g) {
            let base = "";
            let requestedBy = "";
            if (m.linked_entity_type === "ORDER" && m.linked_entity_id) {
                const o = orderInfo.get(m.linked_entity_id);
                if (o) {
                    requestedBy = o.user ?? "";
                    base = [o.ref, o.venue].filter(Boolean).join(" — ");
                }
            } else if (m.linked_entity_type === "SELF_PICKUP" && m.linked_entity_id) {
                const sp = spInfo.get(m.linked_entity_id);
                if (sp) {
                    requestedBy = sp.user ?? "";
                    base = `${sp.ref} — Collector: ${sp.collector ?? ""}`;
                }
            }
            const purpose = base ? `${base} — ${leg}` : leg;
            const withNote = m.note ? `${purpose} — ${m.note}` : purpose;
            const ts = m.created_at ? new Date(m.created_at) : null;
            g = {
                sortKey: ts ? ts.getTime() : 0,
                date: ts,
                requestedBy,
                purpose: withNote,
                deltas: new Map(),
            };
            groups.set(groupKey, g);
        } else if (m.created_at) {
            const t = new Date(m.created_at).getTime();
            if (t < g.sortKey) {
                g.sortKey = t;
                g.date = new Date(m.created_at);
            }
        }
        g.deltas.set(m.family_id, (g.deltas.get(m.family_id) ?? 0) + Number(m.delta));
    }
    const events = [...groups.values()].sort((a, b) => a.sortKey - b.sortKey);

    // ── Stage 5: closing rewind — anchor on physical on-hand, rewind ONLY the ─
    // physical-affecting post-cutoff deltas (same set as the event stream).
    if (lt) {
        const postQuery = sql`
SELECT COALESCE(sm.asset_family_id, a.group_id) AS family_id,
       COALESCE(SUM(sm.delta), 0)::int AS delta_sum
FROM stock_movements sm
LEFT JOIN assets a ON sm.asset_id = a.id
WHERE sm.platform_id = ${ctx.platformId}
  AND ${famLink}
  AND sm.created_at >= ${lt}
  AND ${PHYSICAL_LEG_FILTER}
GROUP BY COALESCE(sm.asset_family_id, a.group_id)`;
        const post = ((await db.execute(postQuery)) as any).rows as any[];
        const postBy = new Map<string, number>();
        for (const r of post) if (r.family_id) postBy.set(String(r.family_id), Number(r.delta_sum));
        for (const f of families) f.closing = f.anchorTotal - (postBy.get(f.id) ?? 0);
    }

    // ── Stage 6: opening = closing − Σ(in-window deltas) so the closing ──────
    // formula always reconciles even when date_from is omitted.
    for (const f of families) {
        let inWindow = 0;
        for (const e of events) inWindow += e.deltas.get(f.id) ?? 0;
        f.opening = f.closing - inWindow;
    }

    // ── Stage 7: render the pivot ────────────────────────────────────────────
    const columns: ReportColumn[] = [
        { header: "DATE", width: 13 },
        { header: "REQUESTED BY", width: 20 },
        { header: "PURPOSE & DETAILS", width: 50 },
        ...families.map((f) => ({
            header: f.name.toUpperCase(),
            width: 14,
            align: "right" as const,
            numFmt: INT_FMT,
        })),
    ];
    const dateLabel = categoryName
        ? `${categoryName} — ${fmtRangeLabel(params.date_from, params.date_to)}`
        : fmtRangeLabel(params.date_from, params.date_to);
    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Stock Movements Ledger",
        subtitle: dateLabel,
        columns,
        sheetName: categoryName ? categoryName.slice(0, 28) : "Stock Ledger",
    });
    const sheet = h.sheet;
    const FIRST_FAM_COL = 4; // cols 1-3 are DATE / REQUESTED BY / PURPOSE

    // Opening row
    const openingLabel = params.date_from
        ? `opening stock (${String(params.date_from).split("-").reverse().join(".")})`
        : "OPENING STOCK";
    const openingRow = sheet.addRow(["", "", openingLabel, ...families.map((f) => f.opening)]);
    openingRow.font = { bold: true };
    openingRow.eachCell({ includeEmpty: true }, (c) => (c.fill = STYLE.SECTION_FILL));
    const openingRowNum = openingRow.number;

    // Event rows (signed deltas, coloured)
    let firstEvent: number | null = null;
    let lastEvent = 0;
    for (const e of events) {
        const cells: any[] = [e.date ? fmtDate(e.date) : "", e.requestedBy, e.purpose];
        for (const f of families) {
            const d = e.deltas.get(f.id);
            cells.push(d === undefined || d === 0 ? "" : d);
        }
        const row = sheet.addRow(cells);
        for (let i = 0; i < families.length; i += 1) colourDelta(row.getCell(FIRST_FAM_COL + i));
        if (firstEvent === null) firstEvent = row.number;
        lastEvent = row.number;
    }

    // Closing row — formula =opening + SUM(events) per family column
    const closingLabel = params.date_to
        ? `closing stock (${String(params.date_to).split("-").reverse().join(".")})`
        : "closing stock";
    const closingCells: any[] = ["", "", closingLabel];
    for (let i = 0; i < families.length; i += 1) {
        const L = colLetter(FIRST_FAM_COL - 1 + i);
        const f = families[i];
        if (firstEvent !== null && lastEvent > 0) {
            closingCells.push({
                formula: `${L}${openingRowNum}+SUM(${L}${firstEvent}:${L}${lastEvent})`,
                result: f.closing,
            });
        } else {
            closingCells.push(f.closing);
        }
    }
    const closingRow = sheet.addRow(closingCells);
    closingRow.font = { bold: true };
    closingRow.eachCell({ includeEmpty: true }, (c) => (c.fill = STYLE.SECTION_FILL));

    // Manual stock-count row
    const countRow = sheet.addRow([
        "",
        "",
        `stock count on the ${fmtDate(ctx.now)}`,
        ...families.map(() => ""),
    ]);
    countRow.font = { italic: true };

    // DIFFERENCE row — =IF(count="","",count-closing)
    const diffCells: any[] = ["", "", "DIFFERENCE"];
    for (let i = 0; i < families.length; i += 1) {
        const L = colLetter(FIRST_FAM_COL - 1 + i);
        diffCells.push({
            formula: `IF(${L}${countRow.number}="","",${L}${countRow.number}-${L}${closingRow.number})`,
        });
    }
    const diffRow = sheet.addRow(diffCells);
    diffRow.font = { bold: true };
    diffRow.eachCell({ includeEmpty: true }, (c) => (c.fill = STYLE.DIFF_FILL));

    finalizeWorkbook(h, events.length);
    return { wb: h.wb, rowCount: events.length };
}

export const stockMovementsReport: ReportDefinition = {
    key: "stock-movements",
    label: "Stock Movements Ledger",
    description:
        "Pivoted reconciliation ledger for one tenant: rows are physical-quantity-impacting movement legs (write-offs, adjustments, ad-hoc removals), columns are asset families. Anchored by OPENING + CLOSING so any column reconciles via Closing = Opening + Σ(events), with a manual stock-count and DIFFERENCE row for physical audits.",
    section: "INVENTORY",
    audience: "ADMIN_CLIENT",
    permissions: ["stock_movements:read", "assets:read"],
    filters: [
        { key: "company_id", label: "Company", type: "company", required: true },
        {
            key: "category",
            label: "Category",
            type: "category-include-exclude",
            required: false,
            mode: "include-only",
            scope: "item",
        },
        { key: "group", label: "Group", type: "group", required: false, mode: "include-only" },
        { key: "date_from", label: "From", type: "date", required: false },
        { key: "date_to", label: "To", type: "date", required: false },
    ],
    paramsSchema,
    rowCap: {
        max: FAMILY_CAP,
        dimension: "pivot-columns",
        narrowHint: "narrow by category or group filter",
    },
    run,
};
