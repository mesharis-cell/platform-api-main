/**
 * Inbound Log — per-inbound-request operations log of goods registered to
 * arrive at / be received into the warehouse, expanded one row per registered
 * item, grouped by request with REGISTERED/RECEIVED quantity subtotals + a
 * grand total. RECEIVED OUTCOME is derived from whether the item has been
 * turned into an asset (iri.asset_id IS NOT NULL). Ported from the canonical
 * CSV (export.services.ts exportInboundLogService); SQL re-parameterized to
 * bound placeholders.
 *
 * LEAK_RISK: BASE OPS TOTAL is a COST (buy) figure → gated on ctx.canSeeMargin.
 * FINAL TOTAL is a sell figure → always allowed. Both pricing columns are
 * REQUEST-level (one prices snapshot per request, expanded across N item rows):
 * rendered FIRST-ROW-ONLY per request and NEVER summed in the qty subtotal.
 * On the client mount no internal column is present (sell-only).
 *
 * ADMIN_CLIENT.
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { PricingService } from "../../../services/pricing.service";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import {
    addGrandTotalRow,
    addSubtotalRow,
    colourOutcome,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    fmtRangeLabel,
    INT_FMT,
    MONEY_FMT,
    parseNum,
    ReportColumn,
    roundMoney,
} from "../../../utils/report-workbook";

const ROW_CAP = 25000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Every inbound status EXCEPT the two dead branches (DECLINED, CANCELLED). */
const DEFAULT_STATUSES = ["PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED", "CONFIRMED", "COMPLETED"] as const;
const ALL_STATUSES = [...DEFAULT_STATUSES, "DECLINED", "CANCELLED"] as const;

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
        status: z.union([z.enum(ALL_STATUSES), z.array(z.enum(ALL_STATUSES))]).optional(),
        brand_id: z.string().uuid().optional(),
    })
    .refine((v) => !(v.category_include && v.category_exclude), {
        message: "category_include and category_exclude are mutually exclusive",
    });

/**
 * Inbound items carry their OWN category column (inbound-created assets get
 * group_id = NULL, so the issuance-style assets.category join is empty here).
 * Filter against inbound_request_items.category (alias "iri").
 */
function categoryFilter(inc: string[], exc: string[]): SQL {
    const col = sql.raw("LOWER(COALESCE(iri.category, ''))");
    if (inc.length) return sql` AND ${col} IN (${sql.join(inc.map((c) => sql`${c.toLowerCase()}`), sql`, `)})`;
    if (exc.length) return sql` AND ${col} NOT IN (${sql.join(exc.map((c) => sql`${c.toLowerCase()}`), sql`, `)})`;
    return sql``;
}

function dateFilter(expr: SQL, gte: Date | null, lt: Date | null): SQL {
    const parts: SQL[] = [];
    if (gte) parts.push(sql` AND ${expr} >= ${gte}`);
    if (lt) parts.push(sql` AND ${expr} < ${lt}`);
    return parts.length ? sql.join(parts, sql``) : sql``;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);

    // Status scope: default to the five live statuses (drop DECLINED/CANCELLED).
    const statuses = toArr(params.status).length ? toArr(params.status) : [...DEFAULT_STATUSES];
    const statusFilter = sql` AND ir.request_status IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`;

    // brand_id matches inbound_request_items.brand_id (item-level): a request is
    // included if ANY of its items match. Sibling non-matching items are dropped
    // (row-level filter), so per-request subtotals reflect only matching items.
    const brandFilter = params.brand_id ? sql` AND iri.brand_id = ${params.brand_id}` : sql``;

    // Date filter target: the existing CSV filters inbound_requests.created_at
    // (export.services.ts:591-592). Kept on created_at to preserve behavior;
    // INCOMING AT (planned arrival) is displayed but not the range axis.
    const query = sql`
SELECT
    ir.incoming_at                                                        AS incoming_at,
    ir.inbound_request_id                                                 AS inbound_request,
    ir.request_status                                                     AS request_status,
    u.name                                                                AS requester,
    u.email                                                               AS requester_email,
    b.name                                                                AS brand,
    iri.name                                                              AS item_name,
    iri.category                                                          AS category,
    iri.tracking_method                                                   AS tracking,
    iri.quantity                                                          AS registered_qty,
    CASE WHEN iri.asset_id IS NOT NULL THEN iri.quantity ELSE 0 END       AS received_qty,
    CASE WHEN iri.asset_id IS NOT NULL THEN 'RECEIVED' ELSE 'REGISTERED' END AS received_outcome,
    a.qr_code                                                             AS created_asset_qr,
    a.status                                                              AS asset_status,
    ir.note                                                               AS note,
    ir.created_at                                                         AS created_at,
    iri.created_at                                                        AS item_created_at,
    -- request-level pricing snapshot (projected per role in JS, first-row-only)
    p.breakdown_lines                                                     AS breakdown_lines,
    p.margin_percent                                                      AS margin_percent,
    p.vat_percent                                                         AS vat_percent,
    p.margin_is_override                                                  AS margin_is_override,
    p.margin_override_reason                                              AS margin_override_reason,
    p.calculated_at                                                       AS calculated_at
FROM inbound_requests ir
JOIN inbound_request_items iri ON iri.inbound_request_id = ir.id
LEFT JOIN users u ON ir.created_by = u.id
LEFT JOIN brands b ON iri.brand_id = b.id
LEFT JOIN assets a ON iri.asset_id = a.id
LEFT JOIN prices p ON ir.request_pricing_id = p.id
WHERE ir.platform_id = ${ctx.platformId} AND ir.company_id = ${ctx.companyId}
  ${statusFilter}
  ${brandFilter}
  ${cat}
  ${dateFilter(sql.raw("ir.created_at"), gte, lt)}
ORDER BY ir.created_at ASC, iri.created_at ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Inbound log has ${rows.length} rows (cap ${ROW_CAP}). Narrow by date range, status, brand, or category.`
        );

    // ── Columns. Sell (FINAL TOTAL) always; cost (BASE OPS TOTAL) gated. ──────
    const showCost = ctx.canSeeMargin && !ctx.isClientMount;

    const columns: ReportColumn[] = [
        { header: "INCOMING AT", width: 13 },
        { header: "INBOUND REQUEST", width: 20 },
        { header: "REQUEST STATUS", width: 16 },
        { header: "REQUESTER", width: 20 },
        { header: "REQUESTER EMAIL", width: 26 },
        { header: "BRAND", width: 18 },
        { header: "ITEM NAME", width: 30 },
        { header: "CATEGORY", width: 16 },
        { header: "TRACKING", width: 12 },
        { header: "REGISTERED QTY", width: 14, align: "right", numFmt: INT_FMT },
        { header: "RECEIVED QTY", width: 13, align: "right", numFmt: INT_FMT },
        { header: "RECEIVED OUTCOME", width: 16 },
        { header: "CREATED ASSET QR", width: 20 },
        { header: "ASSET STATUS", width: 14 },
        ...(showCost ? [{ header: "BASE OPS TOTAL", width: 15, align: "right" as const, numFmt: MONEY_FMT }] : []),
        { header: "FINAL TOTAL", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "NOTE", width: 30 },
        { header: "CREATED AT", width: 13 },
    ];

    // 1-based column indices that vary with the gated cost column.
    const REG = 10;
    const REC = 11;
    const OUTCOME = 12;
    const LABEL = 7; // ITEM NAME column carries the subtotal/grand-total label
    const BASE_OPS_COL = showCost ? 15 : null;
    const FINAL_COL = showCost ? 16 : 15;

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Inbound Log",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Inbound Log",
    });
    const sheet = h.sheet;

    // Group by request — one prices snapshot per request, expanded across items.
    const groups = new Map<string, any[]>();
    for (const r of rows) {
        const ref = String(r.inbound_request);
        if (!groups.has(ref)) groups.set(ref, []);
        groups.get(ref)!.push(r);
    }

    const subRows: number[] = [];
    for (const [ref, gr] of groups) {
        // Request-level pricing — projected ONCE, rendered first-row-only.
        const pricing = gr[0]?.breakdown_lines != null ? (gr[0] as any) : null;
        const baseOps = showCost
            ? roundMoney(parseNum((PricingService.projectByRole(pricing as any, "ADMIN") as any)?.base_ops_total))
            : 0;
        const finalTotal = roundMoney(
            parseNum((PricingService.projectSummaryForRole(pricing as any, "ADMIN") as any)?.final_total)
        );

        let first = 0;
        let last = 0;
        gr.forEach((r, idx) => {
            const base: any[] = [
                fmtDate(r.incoming_at),
                r.inbound_request,
                r.request_status,
                r.requester ?? "",
                r.requester_email ?? "",
                r.brand ?? "",
                r.item_name ?? "",
                r.category ?? "",
                r.tracking ?? "",
                Number(r.registered_qty) || 0,
                Number(r.received_qty) || 0,
                r.received_outcome,
                r.created_asset_qr ?? "",
                r.asset_status ?? "",
            ];
            // Pricing columns appear once per request (first item row only).
            if (showCost) base.push(idx === 0 ? baseOps : "");
            base.push(idx === 0 ? finalTotal : "");
            base.push(r.note ?? "");
            base.push(fmtDate(r.created_at));

            const row = sheet.addRow(base);
            colourOutcome(row.getCell(OUTCOME), String(r.received_outcome));
            if (!first) first = row.number;
            last = row.number;
        });

        // Subtotal: ONLY the two quantity columns are summed. Pricing columns
        // are request-scoped (single snapshot) and must NOT be =SUM()'d here.
        const sub = addSubtotalRow(sheet, {
            label: `Subtotal — ${ref}`,
            labelCol: LABEL,
            sums: [
                { col: REG, from: first, to: last, cached: gr.reduce((n, r) => n + (Number(r.registered_qty) || 0), 0) },
                { col: REC, from: first, to: last, cached: gr.reduce((n, r) => n + (Number(r.received_qty) || 0), 0) },
            ],
        });
        // Echo the request-level pricing onto the subtotal row so each request's
        // single BASE OPS / FINAL figure is legible alongside its qty subtotal,
        // without being part of any sum.
        if (BASE_OPS_COL) sub.getCell(BASE_OPS_COL).value = baseOps;
        sub.getCell(FINAL_COL).value = finalTotal;
        subRows.push(sub.number);
        sheet.addRow([]);
    }

    // Grand total — quantity columns only (pricing is per-request, not summed).
    addGrandTotalRow(sheet, {
        label: `GRAND TOTAL — ${ctx.companyName}`,
        labelCol: LABEL,
        sums: [
            { col: REG, subtotalRows: subRows, cached: rows.reduce((n, r) => n + (Number(r.registered_qty) || 0), 0) },
            { col: REC, subtotalRows: subRows, cached: rows.reduce((n, r) => n + (Number(r.received_qty) || 0), 0) },
        ],
    });

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const inboundLogReport: ReportDefinition = {
    key: "inbound-log",
    label: "Inbound Log",
    description:
        "Per-inbound-request operations log of goods registered to arrive at the warehouse, one row per item, grouped by request with REGISTERED/RECEIVED quantity subtotals and a receipt outcome (REGISTERED vs RECEIVED). Pricing columns are request-scoped.",
    section: "OPERATIONS",
    audience: "ADMIN_CLIENT",
    permissions: ["orders:export", "orders:read"],
    filters: [
        { key: "company_id", label: "Company", type: "company", required: true },
        { key: "date_from", label: "From", type: "date", required: false },
        { key: "date_to", label: "To", type: "date", required: false },
        {
            key: "category",
            label: "Category",
            type: "category-include-exclude",
            required: false,
            mode: "include-exclude",
            scope: "item",
        },
        {
            key: "status",
            label: "Request Status",
            type: "status",
            required: false,
            options: ALL_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
        },
        { key: "brand_id", label: "Brand", type: "group", required: false, scope: "item" },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint: "narrow by date range, status, brand, or category",
    },
    run,
};
