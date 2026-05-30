/**
 * Revenue Report — per-document financial revenue ledger. ORDER-ONLY (legacy
 * scope: the report it replaces, exportRevenueReportService, covered orders
 * only; the four-entity ledger is a deliberate FUTURE upgrade, not this build).
 * One row per revenue-bearing order (committed, not tentative/dead) showing its
 * sell-side pricing snapshot (subtotal, VAT, final) plus — gated on margin
 * visibility — buy total + margin. Grand-total row at the bottom.
 *
 * Money columns are NOT queryable scalars: prices.breakdown_lines + margin/vat
 * are projected in JS via PricingService.projectSummaryForRole(row,'ADMIN').
 *
 * FINANCIAL · ADMIN-only — never mounted client-side (carries BUY/MARGIN).
 * DOC DATE = COALESCE(MAX outbound scan, orders.created_at).
 *
 * Numbers-skeptic required fixes APPLIED:
 *  - date_to is a half-open upper bound (fmtDateBounds → Dubai end-of-day < lt),
 *    so a same-day order at any hour is included — no silent under-count.
 *  - every money column is coerced via parseNum() BEFORE summation; the null
 *    projection (no prices row) is guarded → 0.
 *  - MARGIN AMOUNT = SUBTOTAL (sell ex-VAT) − BUY TOTAL. VAT is pass-through and
 *    is NOT part of margin (FINAL TOTAL − BUY would wrongly fold VAT into it).
 *  - status param validated against orderStatusEnum, applied to the ORDER leg
 *    only (single-entity report → no enum-mismatch ambiguity).
 *  - cost/margin columns NEVER emitted unless ctx.canSeeMargin; the client mount
 *    is rejected outright (this report is admin-only by section).
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
    colLetter,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    fmtRangeLabel,
    MONEY_FMT,
    parseNum,
    ReportColumn,
    roundMoney,
} from "../../../utils/report-workbook";

const ROW_CAP = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Revenue-bearing = committed (CONFIRMED..CLOSED). Tentative + dead statuses
 *  carry a pricing snapshot since the submit-time-booking flip but are NOT
 *  revenue yet — same gate as exportRevenueReportService (export.services.ts:670). */
const REVENUE_STATUSES = [
    "CONFIRMED",
    "IN_PREPARATION",
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "DERIG",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
] as const;

const ORDER_STATUSES = [
    "DRAFT",
    "SUBMITTED",
    "PRICING_REVIEW",
    "PENDING_APPROVAL",
    "QUOTED",
    "DECLINED",
    "CONFIRMED",
    "IN_PREPARATION",
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "DERIG",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
    "CANCELLED",
] as const;

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
        status: z.enum(ORDER_STATUSES).optional(),
        team: z.string().uuid().optional(),
    })
    .refine((v) => !(v.category_include && v.category_exclude), {
        message: "category_include and category_exclude are mutually exclusive",
    });

/**
 * Item-scoped (coarse) category filter on the ORDER: EXISTS an order_item whose
 * asset.category matches. Document-grained — an order with ANY matching item is
 * kept whole. Tenant-agnostic (compares LOWER(category)).
 */
function categoryExistsFilter(inc: string[], exc: string[]): SQL {
    if (inc.length) {
        return sql` AND EXISTS (SELECT 1 FROM order_items oi JOIN assets a ON oi.asset = a.id
            WHERE oi."order" = o.id
              AND LOWER(COALESCE(a.category, '')) IN (${sql.join(
                  inc.map((c) => sql`${c.toLowerCase()}`),
                  sql`, `
              )}))`;
    }
    if (exc.length) {
        return sql` AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN assets a ON oi.asset = a.id
            WHERE oi."order" = o.id
              AND LOWER(COALESCE(a.category, '')) IN (${sql.join(
                  exc.map((c) => sql`${c.toLowerCase()}`),
                  sql`, `
              )}))`;
    }
    return sql``;
}

/** Item-scoped (coarse) team filter on the ORDER: EXISTS an order_item whose
 *  asset belongs to the team. */
function teamExistsFilter(teamId?: string): SQL {
    if (!teamId) return sql``;
    return sql` AND EXISTS (SELECT 1 FROM order_items oi JOIN assets a ON oi.asset = a.id
        WHERE oi."order" = o.id AND a.team_id = ${teamId})`;
}

function statusFilter(status?: string): SQL {
    if (status) return sql` AND o.order_status = ${status}`;
    return sql` AND o.order_status IN (${sql.join(
        REVENUE_STATUSES.map((s) => sql`${s}`),
        sql`, `
    )})`;
}

function dateFilter(expr: SQL, gte: Date | null, lt: Date | null): SQL {
    const parts: SQL[] = [];
    if (gte) parts.push(sql` AND ${expr} >= ${gte}`);
    if (lt) parts.push(sql` AND ${expr} < ${lt}`);
    return parts.length ? sql.join(parts, sql``) : sql``;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    // FINANCIAL / admin-only: this report carries (or may carry) BUY + MARGIN.
    // The client mount must never reach it; reject defensively even though the
    // route gating should already prevent it.
    if (ctx.isClientMount)
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Revenue Report is not available on the client portal."
        );

    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const docDate = sql.raw("COALESCE(ooa.issued_at, o.created_at)");

    const query = sql`
WITH order_outbound_at AS (
    SELECT se."order"::uuid AS order_id, MAX(se.scanned_at) AS issued_at
    FROM scan_events se
    WHERE se.scan_type = 'OUTBOUND' AND se."order" IS NOT NULL
    GROUP BY se."order"
)
SELECT
    COALESCE(ooa.issued_at, o.created_at) AS doc_date,
    'ORDER' AS entity_type,
    o.order_id AS reference,
    o.order_status::text AS status,
    o.financial_status::text AS financial_status,
    c.name AS company,
    b.name AS brand,
    u.name AS created_by,
    p.breakdown_lines AS breakdown_lines,
    p.margin_percent AS margin_percent,
    p.vat_percent AS vat_percent,
    p.margin_is_override AS margin_is_override,
    p.margin_override_reason AS margin_override_reason,
    p.calculated_at AS calculated_at
FROM orders o
LEFT JOIN companies c ON o.company = c.id
LEFT JOIN brands b ON o.brand = b.id
LEFT JOIN users u ON o.created_by = u.id
LEFT JOIN prices p ON o.order_pricing_id = p.id
LEFT JOIN order_outbound_at ooa ON ooa.order_id = o.id
WHERE o.platform_id = ${ctx.platformId}
  AND o.company = ${ctx.companyId}
  AND o.deleted_at IS NULL
  ${statusFilter(params.status)}
  ${categoryExistsFilter(inc, exc)}
  ${teamExistsFilter(params.team)}
  ${dateFilter(docDate, gte, lt)}
ORDER BY doc_date ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Revenue ledger has ${rows.length} rows (cap ${ROW_CAP}). Narrow by date range, status, team, or category.`
        );

    // Sell columns are always allowed; cost/margin only with margin visibility.
    const columns: ReportColumn[] = [
        { header: "DOC DATE", width: 13 },
        { header: "ENTITY TYPE", width: 13 },
        { header: "REFERENCE", width: 20 },
        { header: "STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
        { header: "COMPANY", width: 24 },
        { header: "BRAND", width: 20 },
        { header: "CREATED BY", width: 20 },
        { header: "SUBTOTAL", width: 14, align: "right", numFmt: MONEY_FMT },
        { header: "VAT %", width: 9, align: "right" },
        { header: "VAT AMOUNT", width: 14, align: "right", numFmt: MONEY_FMT },
        { header: "FINAL TOTAL", width: 15, align: "right", numFmt: MONEY_FMT },
    ];
    if (ctx.canSeeMargin) {
        columns.push(
            { header: "BUY TOTAL", width: 14, align: "right", numFmt: MONEY_FMT },
            { header: "MARGIN AMOUNT", width: 15, align: "right", numFmt: MONEY_FMT },
            { header: "MARGIN %", width: 11, align: "right" }
        );
    }

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Revenue Report",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Revenue",
    });
    const sheet = h.sheet;

    // 1-based column indexes for the summable money columns.
    const SUBTOTAL = 9;
    const VAT_AMOUNT = 11;
    const FINAL_TOTAL = 12;
    const BUY_TOTAL = 13;
    const MARGIN_AMOUNT = 14;
    const LABEL = 8; // "CREATED BY" column carries the grand-total label.

    const firstDataRow = h.headerRow + 1;
    let subtotalSum = 0;
    let vatSum = 0;
    let finalSum = 0;
    let buySum = 0;
    let marginSum = 0;

    for (const r of rows) {
        // projectSummaryForRole returns null when there is no prices row; guard
        // every field. Money fields come back as .toFixed(2) strings → parseNum.
        const summary = PricingService.projectSummaryForRole(r as any, "ADMIN");
        const subtotal = roundMoney(parseNum(summary?.subtotal));
        const vatPercent = parseNum(summary?.vat_percent);
        const vatAmount = roundMoney(parseNum(summary?.vat_amount));
        const finalTotal = roundMoney(parseNum(summary?.final_total));
        const buyTotal = roundMoney(parseNum(summary?.buy_total));
        // Margin is sell-ex-VAT minus buy (VAT is pass-through, never margin).
        const marginAmount = roundMoney(subtotal - buyTotal);
        const marginPercent = parseNum(summary?.margin_percent);

        const cells: any[] = [
            fmtDate(r.doc_date),
            r.entity_type,
            r.reference ?? "",
            r.status ?? "",
            r.financial_status ?? "",
            r.company ?? "",
            r.brand ?? "",
            r.created_by ?? "",
            subtotal,
            vatPercent,
            vatAmount,
            finalTotal,
        ];
        if (ctx.canSeeMargin) {
            cells.push(buyTotal, marginAmount, marginPercent);
        }
        sheet.addRow(cells);

        subtotalSum += subtotal;
        vatSum += vatAmount;
        finalSum += finalTotal;
        buySum += buyTotal;
        marginSum += marginAmount;
    }

    if (rows.length > 0) {
        const lastDataRow = firstDataRow + rows.length - 1;
        const sums: { col: number; from: number; to: number; cached: number }[] = [
            { col: SUBTOTAL, from: firstDataRow, to: lastDataRow, cached: subtotalSum },
            { col: VAT_AMOUNT, from: firstDataRow, to: lastDataRow, cached: vatSum },
            { col: FINAL_TOTAL, from: firstDataRow, to: lastDataRow, cached: finalSum },
        ];
        if (ctx.canSeeMargin) {
            sums.push(
                { col: BUY_TOTAL, from: firstDataRow, to: lastDataRow, cached: buySum },
                { col: MARGIN_AMOUNT, from: firstDataRow, to: lastDataRow, cached: marginSum }
            );
        }
        // Flat ledger (one row per order, no per-group subtotal rows), so the
        // amber grand-total row sums the full data range directly. addGrandTotalRow
        // emits "0" for empty subtotalRows; overwrite each money cell with a
        // SUM(range) formula (cached result already rounded) so Excel recomputes.
        addGrandTotalRow(sheet, {
            label: `GRAND TOTAL — ${ctx.companyName}`,
            labelCol: LABEL,
            sums: sums.map((s) => ({ col: s.col, subtotalRows: [], cached: s.cached })),
        });
        const grandRow = sheet.lastRow!;
        for (const s of sums) {
            const L = colLetter(s.col - 1);
            grandRow.getCell(s.col).value = {
                formula: `SUM(${L}${s.from}:${L}${s.to})`,
                result: roundMoney(s.cached),
            };
        }
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const revenueReport: ReportDefinition = {
    key: "revenue",
    label: "Revenue Report",
    description:
        "Per-document financial revenue ledger (orders only): one row per committed order with its sell-side pricing snapshot — subtotal, VAT, final total — plus buy total and margin when margin visibility is held. Scoped to one company over an optional date range, for ADMIN reconciliation of booked revenue. Revenue date is COALESCE(outbound scan, created_at), a proxy: there is no recognition timestamp in schema.",
    section: "FINANCIAL",
    audience: "ADMIN",
    operationsRoles: ["ADMIN"],
    permissions: ["analytics:view_revenue", "orders:export"],
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
            label: "Status",
            type: "status",
            required: false,
            options: REVENUE_STATUSES.map((s) => ({ value: s, label: s })),
        },
        { key: "team", label: "Team", type: "team", required: false, scope: "item" },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint: "narrow by date range, status, team, or category",
    },
    run,
};
