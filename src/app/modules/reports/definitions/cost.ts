/**
 * Cost Report — ADMIN-only, ORDER-ONLY buy/margin reconciliation.
 *
 * One row per CONFIRMED+ order showing the buy-side cost split (BASE_OPS /
 * rate-card / custom), TOTAL BUY COST, SELL TOTAL (ex-VAT), MARGIN AMOUNT,
 * derived MARGIN %, and the margin-override flag — so finance can reconcile what
 * the platform owes the warehouse against client revenue per company over a date
 * window. Replaces the legacy `exportCostReportService`
 * (src/app/modules/export/export.services.ts), which only emitted a per-company
 * grand-total CSV.
 *
 * EVERY column on this report is internal (buy / sell / margin). It is gated on
 * ctx.canSeeMargin and MUST NEVER appear on the client mount — audience stays
 * ADMIN. There is NO pricing_mode on orders (resolveEntityContext hardcodes
 * STANDARD for ORDER), so the legacy PRICING MODE / NO_COST narrative is dropped.
 *
 * The buy/sell/margin split is computed in JS from prices.breakdown_lines via
 * PricingService.projectByRole(...,'ADMIN') — the engine owns the
 * billable/voided/rounding rules. SQL only assembles rows + applies scope.
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { PricingService } from "../../../services/pricing.service";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import {
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
    STYLE,
} from "../../../utils/report-workbook";

const ROW_CAP = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cost-recognition status gate (verbatim from exportCostReportService:730-733):
 * tentative orders carry pricing but no committed cost; pre-confirmed/cancelled
 * rows aren't real cost yet. The optional `status` param may only NARROW within
 * this set — selecting a pre-confirmation status returns empty (those carry no
 * recognized cost), never overrides the gate.
 */
const COST_RECOGNIZED_STATUSES = [
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

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
        status: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .refine((v) => !(v.category_include && v.category_exclude), {
        message: "category_include and category_exclude are mutually exclusive",
    });

/**
 * Generic, tenant-agnostic category filter. This is a per-order report but
 * assets.category is per-item, so the filter is an order-level EXISTS subquery:
 * keep the order if it has >=1 in-scope item (include) / >=1 item NOT in the
 * excluded set (exclude). NOTE: this is order-level INCLUSION, not line-level
 * cost subtraction — an order's FULL buy cost stays whenever any item qualifies,
 * so per-category runs are NOT additive across categories.
 */
function categoryFilter(inc: string[], exc: string[]): SQL {
    const col = sql.raw("LOWER(COALESCE(a.category, ''))");
    const exists = (pred: SQL) => sql` AND EXISTS (
        SELECT 1 FROM order_items oi
        JOIN assets a ON oi."asset" = a.id
        WHERE oi."order" = o.id AND ${pred}
    )`;
    if (inc.length)
        return exists(sql`${col} IN (${sql.join(inc.map((c) => sql`${c.toLowerCase()}`), sql`, `)})`);
    if (exc.length)
        return exists(sql`${col} NOT IN (${sql.join(exc.map((c) => sql`${c.toLowerCase()}`), sql`, `)})`);
    return sql``;
}

function dateFilter(expr: SQL, gte: Date | null, lt: Date | null): SQL {
    const parts: SQL[] = [];
    if (gte) parts.push(sql` AND ${expr} >= ${gte}`);
    if (lt) parts.push(sql` AND ${expr} < ${lt}`);
    return parts.length ? sql.join(parts, sql``) : sql``;
}

/** Resolve the optional status narrow: intersect with the recognized set. */
function statusFilter(requested: string[]): SQL {
    if (!requested.length) {
        return sql` AND o.order_status IN (${sql.join(
            COST_RECOGNIZED_STATUSES.map((s) => sql`${s}`),
            sql`, `
        )})`;
    }
    const allowed = COST_RECOGNIZED_STATUSES as readonly string[];
    const narrowed = requested.map((s) => s.toUpperCase()).filter((s) => allowed.includes(s));
    if (!narrowed.length) {
        // Pre-confirmation / unrecognized status selected → empty result, never
        // an override of the cost-recognition gate.
        return sql` AND FALSE`;
    }
    return sql` AND o.order_status IN (${sql.join(narrowed.map((s) => sql`${s}`), sql`, `)})`;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    // Hard gate: every column on this report is buy / sell / margin. If the
    // caller cannot see margin (or it somehow reached a client mount), there is
    // no client-safe subset to render — refuse rather than emit an empty shell.
    if (!ctx.canSeeMargin || ctx.isClientMount) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "The Cost Report exposes buy cost and margin and is restricted to admins with margin visibility."
        );
    }

    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const statuses = toArr(params.status);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);

    // Core fetch (orders + 1:1 pricing snapshot). orders.order_pricing_id is a
    // NOT NULL single-valued FK → exactly one prices row per order; the cost
    // SPLIT is computed in JS from p.breakdown_lines below, so there is no
    // fan-out in the buy/sell/margin numbers. Date filter is pinned to
    // o.created_at (matches the legacy report, preserves cross-report tie-out).
    const query = sql`
SELECT
    o.order_id            AS order_id,
    o.order_status        AS order_status,
    o.financial_status    AS financial_status,
    o.event_start_date    AS event_start_date,
    o.event_end_date      AS event_end_date,
    c.name                AS company_name,
    b.name                AS brand_name,
    p.breakdown_lines     AS breakdown_lines,
    p.margin_percent      AS margin_percent,
    p.vat_percent         AS vat_percent,
    p.margin_is_override  AS margin_is_override,
    p.margin_override_reason AS margin_override_reason,
    p.calculated_at       AS priced_at
FROM orders o
LEFT JOIN companies c ON o."company" = c.id
LEFT JOIN brands b ON o."brand" = b.id
LEFT JOIN prices p ON o.order_pricing_id = p.id
WHERE o.platform_id = ${ctx.platformId}
  AND o."company" = ${ctx.companyId}
  AND o.deleted_at IS NULL
  ${statusFilter(statuses)}
  ${cat}
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}
ORDER BY o.created_at ASC, o.order_id ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cost report has ${rows.length} orders (cap ${ROW_CAP}). Narrow by date range, status, or category.`
        );

    // All columns are internal (ctx.canSeeMargin already enforced above).
    const columns: ReportColumn[] = [
        { header: "ORDER ID", width: 20 },
        { header: "COMPANY", width: 24 },
        { header: "BRAND", width: 20 },
        { header: "STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
        { header: "EVENT START", width: 13 },
        { header: "EVENT END", width: 13 },
        { header: "BASE OPS COST", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "RATE CARD COST", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "CUSTOM COST", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "TOTAL BUY COST", width: 16, align: "right", numFmt: MONEY_FMT },
        { header: "SELL TOTAL (EX VAT)", width: 17, align: "right", numFmt: MONEY_FMT },
        { header: "MARGIN AMOUNT", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "MARGIN %", width: 11, align: "right", numFmt: "#,##0.00" },
        { header: "MARGIN OVERRIDE", width: 16 },
        { header: "PRICED AT", width: 13 },
    ];

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Cost Report",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Cost",
    });
    const sheet = h.sheet;

    // 1-based column indices for the money columns we grand-total.
    const BASE_OPS = 8;
    const RATE_CARD = 9;
    const CUSTOM = 10;
    const TOTAL_BUY = 11;
    const SELL = 12;
    const MARGIN_AMT = 13;
    const LABEL = 7; // grand-total label sits under EVENT END (last non-money col)

    let firstDataRow = 0;
    let lastDataRow = 0;

    // Per-report rounded accumulators — grand totals reduce over already-rounded
    // per-row values (roundMoney), so the Excel SUM ties to the cached JS sum.
    let sumBaseOps = 0;
    let sumRateCard = 0;
    let sumCustom = 0;
    let sumBuy = 0;
    let sumSell = 0;
    let sumMargin = 0;

    for (const r of rows) {
        // projectByRole(...,'ADMIN') returns the full BreakdownTotals plus the
        // margin policy. base_ops_total / line_items.* are the BUY-side figures
        // (totals.buy_*); .totals carries buy_total, sell_total, margin_amount.
        const admin = PricingService.projectByRole(r as any, "ADMIN");
        const totals = (admin?.totals ?? null) as
            | {
                  buy_base_ops_total?: unknown;
                  buy_rate_card_total?: unknown;
                  buy_custom_total?: unknown;
                  buy_total?: unknown;
                  sell_total?: unknown;
                  margin_amount?: unknown;
              }
            | null;

        const baseOps = roundMoney(parseNum(totals?.buy_base_ops_total));
        const rateCard = roundMoney(parseNum(totals?.buy_rate_card_total));
        const custom = roundMoney(parseNum(totals?.buy_custom_total));
        const buyTotal = roundMoney(parseNum(totals?.buy_total));
        const sellTotal = roundMoney(parseNum(totals?.sell_total));
        const marginAmount = roundMoney(parseNum(totals?.margin_amount));

        // Derived / realized MARGIN % = margin_amount / buy_total * 100. Guard
        // the divide; with zero buy (NO_COST or empty pricing) margin % is N/A.
        const marginPct = buyTotal > 0 ? roundMoney((marginAmount / buyTotal) * 100) : null;

        const isOverride = !!r.margin_is_override;
        const overrideReason = r.margin_override_reason ? ` — ${r.margin_override_reason}` : "";

        const row = sheet.addRow([
            r.order_id ?? "",
            r.company_name ?? "",
            r.brand_name ?? "",
            r.order_status ?? "",
            r.financial_status ?? "",
            fmtDate(r.event_start_date),
            fmtDate(r.event_end_date),
            baseOps,
            rateCard,
            custom,
            buyTotal,
            sellTotal,
            marginAmount,
            marginPct === null ? "N/A" : marginPct,
            isOverride ? `YES${overrideReason}` : "NO",
            fmtDate(r.priced_at),
        ]);

        if (!firstDataRow) firstDataRow = row.number;
        lastDataRow = row.number;

        sumBaseOps += baseOps;
        sumRateCard += rateCard;
        sumCustom += custom;
        sumBuy += buyTotal;
        sumSell += sellTotal;
        sumMargin += marginAmount;
    }

    // Grand-total row: GRAND BUY = Σ TOTAL BUY COST; GRAND SELL = Σ SELL TOTAL;
    // GRAND MARGIN = Σ MARGIN AMOUNT = GRAND SELL − GRAND BUY. The SUM formula
    // spans the contiguous data block (firstDataRow..lastDataRow).
    if (rows.length > 0) {
        // This report has a single flat data block (no per-group subtotals), so
        // the toolkit's addGrandTotalRow (which sums discrete subtotal cells)
        // doesn't fit — build the amber SUM(range) row directly, mirroring its
        // styling (STYLE.GRAND_FILL). Cached results are Σ(rounded per-row) so
        // the Excel SUM ties to the JS reduce with no cent drift.
        const grand = sheet.addRow([]);
        grand.getCell(LABEL).value = `GRAND TOTAL — ${ctx.companyName}`;
        grand.font = { bold: true, size: 12 };
        grand.height = 20;
        grand.eachCell({ includeEmpty: true }, (cell) => (cell.fill = STYLE.GRAND_FILL));
        const setSum = (col: number, cached: number) => {
            const L = colLetter(col - 1);
            grand.getCell(col).value = {
                formula: `SUM(${L}${firstDataRow}:${L}${lastDataRow})`,
                result: roundMoney(cached),
            };
        };
        setSum(BASE_OPS, sumBaseOps);
        setSum(RATE_CARD, sumRateCard);
        setSum(CUSTOM, sumCustom);
        setSum(TOTAL_BUY, sumBuy);
        setSum(SELL, sumSell);
        setSum(MARGIN_AMT, sumMargin);
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const costReport: ReportDefinition = {
    key: "cost",
    label: "Cost Report",
    description:
        "Admin-only per-order buy-side cost (what the platform owes the warehouse): BASE_OPS / rate-card / custom split, total buy cost, sell total (ex-VAT), margin amount, and realized margin %. Orders only, CONFIRMED and later. Exposes cost and margin — never client-facing.",
    section: "FINANCIAL",
    audience: "ADMIN",
    operationsRoles: ["ADMIN"],
    permissions: ["orders:export"],
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
            scope: "document",
        },
        { key: "status", label: "Status", type: "status", required: false },
    ],
    paramsSchema,
    rowCap: { max: ROW_CAP, dimension: "rows", narrowHint: "narrow by date range, status, or category" },
    run,
};
