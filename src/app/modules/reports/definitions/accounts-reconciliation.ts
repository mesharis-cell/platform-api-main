/**
 * Accounts Reconciliation — per-document financial reconciliation ledger for one
 * tenant: one row per billable commercial document (orders + service-requests)
 * showing quoted buy / sell-subtotal / margin / VAT / final totals (from the
 * entity's prices snapshot, projected via PricingService) alongside its latest
 * invoice + payment status, so finance can tie every dirham back to a document.
 *
 * Ported from exportAccountsReconciliationService + contextToReconciliationRows
 * (src/app/modules/export/export.services.ts). SQL re-parameterized to bound
 * placeholders. LEGACY SCOPE: ORDER + SERVICE_REQUEST only — the existing CSV
 * deliberately drops inbound + self-pickup; we do not widen it here.
 *
 * Money columns (BUY TOTAL / MARGIN AMOUNT / MARGIN %) are gated on
 * ctx.canSeeMargin. SELL SUBTOTAL / VAT / FINAL TOTAL are always allowed.
 * FINANCIAL · ADMIN-only (never client-mounted) → LEAK_RISK report.
 *
 * SERVICE REQUEST money honours service_requests.client_sell_override_total when
 * non-null (mirrors getServiceRequestClientTotal) — otherwise the report would
 * show the pre-concession projected amount. For an override SR the per-row
 * SELL = BUY + MARGIN identity is intentionally relaxed (sell is a manual figure,
 * not a projection of buy + margin).
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
    INT_FMT,
    MONEY_FMT,
    parseNum,
    ReportColumn,
    roundMoney,
    STYLE,
} from "../../../utils/report-workbook";

const ROW_CAP = 25000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .refine((v) => !(v.category_include && v.category_exclude), {
        message: "category_include and category_exclude are mutually exclusive",
    });

/** Generic, tenant-agnostic category filter against assets.category (alias "a"). */
function categoryFilter(inc: string[], exc: string[]): SQL {
    const col = sql.raw("LOWER(COALESCE(a.category, ''))");
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

type RawRow = {
    document_type: "ORDER" | "SERVICE_REQUEST";
    reference: string;
    document_date: Date | string | null;
    company: string | null;
    context_name: string | null;
    operational_status: string | null;
    financial_status: string | null;
    // prices snapshot (projected in TS — money is NOT summed in SQL)
    breakdown_lines: unknown;
    margin_percent: string | number | null;
    vat_percent: string | number | null;
    margin_is_override: boolean | null;
    margin_override_reason: string | null;
    calculated_at: Date | string | null;
    // SR-only override (decimal → string from PG); null for orders
    client_sell_override_total: string | null;
    // latest-invoice columns
    invoice_number: string | null;
    invoice_date: Date | string | null;
    invoice_paid_at: Date | string | null;
    payment_method: string | null;
    payment_reference: string | null;
};

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);

    // The category filter is document-level EXISTS over the entity's items joined
    // to assets.category. Only meaningful for ORDER + SR rows that own item rows;
    // it is a coarse refinement, not a per-line filter (financial report grain is
    // one row per document).
    const hasCategoryFilter = inc.length > 0 || exc.length > 0;
    const orderCategoryExists = hasCategoryFilter
        ? sql` AND EXISTS (
              SELECT 1 FROM order_items oi
              LEFT JOIN assets a ON oi.asset = a.id
              WHERE oi."order" = o.id ${cat}
          )`
        : sql``;
    const srCategoryExists = hasCategoryFilter
        ? sql` AND EXISTS (
              SELECT 1 FROM service_request_items sri
              LEFT JOIN assets a ON sri.asset_id = a.id
              WHERE sri.service_request_id = sr.id ${cat}
          )`
        : sql``;

    const query = sql`
WITH latest_inv AS (
    SELECT DISTINCT ON (COALESCE(i.order_id, i.service_request_id))
        i.order_id,
        i.service_request_id,
        i.invoice_id,
        i.created_at AS invoice_created_at,
        i.invoice_paid_at,
        i.payment_method,
        i.payment_reference
    FROM invoices i
    WHERE i.platform_id = ${ctx.platformId}
      AND num_nonnulls(i.order_id, i.inbound_request_id, i.service_request_id, i.self_pickup_id) = 1
      AND (i.order_id IS NOT NULL OR i.service_request_id IS NOT NULL)
    ORDER BY COALESCE(i.order_id, i.service_request_id), i.created_at DESC
)
SELECT
    'ORDER' AS document_type,
    o.order_id AS reference,
    o.created_at AS document_date,
    co.name AS company,
    o.venue_name AS context_name,
    o.order_status::text AS operational_status,
    o.financial_status::text AS financial_status,
    p.breakdown_lines AS breakdown_lines,
    p.margin_percent AS margin_percent,
    p.vat_percent AS vat_percent,
    p.margin_is_override AS margin_is_override,
    p.margin_override_reason AS margin_override_reason,
    p.calculated_at AS calculated_at,
    NULL::text AS client_sell_override_total,
    inv.invoice_id AS invoice_number,
    inv.invoice_created_at AS invoice_date,
    inv.invoice_paid_at AS invoice_paid_at,
    inv.payment_method AS payment_method,
    inv.payment_reference AS payment_reference
FROM orders o
JOIN companies co ON o.company = co.id
LEFT JOIN prices p ON p.id = o.order_pricing_id
LEFT JOIN latest_inv inv ON inv.order_id = o.id
WHERE o.platform_id = ${ctx.platformId}
  AND o.company = ${ctx.companyId}
  AND o.deleted_at IS NULL
  AND o.order_status NOT IN ('DRAFT', 'CANCELLED')
  ${orderCategoryExists}
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}

UNION ALL

SELECT
    'SERVICE_REQUEST' AS document_type,
    sr.service_request_id AS reference,
    sr.created_at AS document_date,
    co.name AS company,
    sr.title AS context_name,
    sr.request_status::text AS operational_status,
    sr.commercial_status::text AS financial_status,
    p.breakdown_lines AS breakdown_lines,
    p.margin_percent AS margin_percent,
    p.vat_percent AS vat_percent,
    p.margin_is_override AS margin_is_override,
    p.margin_override_reason AS margin_override_reason,
    p.calculated_at AS calculated_at,
    sr.client_sell_override_total::text AS client_sell_override_total,
    inv.invoice_id AS invoice_number,
    inv.invoice_created_at AS invoice_date,
    inv.invoice_paid_at AS invoice_paid_at,
    inv.payment_method AS payment_method,
    inv.payment_reference AS payment_reference
FROM service_requests sr
JOIN companies co ON sr.company_id = co.id
LEFT JOIN prices p ON p.id = sr.request_pricing_id
LEFT JOIN latest_inv inv ON inv.service_request_id = sr.id
WHERE sr.platform_id = ${ctx.platformId}
  AND sr.company_id = ${ctx.companyId}
  AND sr.request_status NOT IN ('DRAFT', 'CANCELLED')
  ${srCategoryExists}
  ${dateFilter(sql.raw("sr.created_at"), gte, lt)}

ORDER BY document_date ASC`;

    const rows = ((await db.execute(query)) as any).rows as RawRow[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Accounts reconciliation has ${rows.length} rows (cap ${ROW_CAP}). Narrow by date range, financial status, or category.`
        );

    // Project each row's pricing snapshot to ADMIN totals (the only role with
    // buy/margin). Sell columns come from the same projection. For an SR with a
    // client_sell_override_total, SELL/FINAL are overridden by the manual figure;
    // buy/margin remain the projected cost side (margin then no longer equals
    // sell - buy — intentional, surfaced not asserted).
    type Computed = {
        raw: RawRow;
        buy_total: number;
        sell_subtotal: number;
        margin_amount: number;
        margin_percent: number;
        vat_percent: number;
        vat_amount: number;
        final_total: number;
        sell_overridden: boolean;
    };

    const computed: Computed[] = rows.map((r) => {
        const pricing = r.breakdown_lines
            ? {
                  breakdown_lines: r.breakdown_lines,
                  margin_percent: r.margin_percent,
                  vat_percent: r.vat_percent,
                  margin_is_override: r.margin_is_override,
                  margin_override_reason: r.margin_override_reason,
                  calculated_at: r.calculated_at,
              }
            : null;

        const detail = PricingService.projectByRole(pricing as any, "ADMIN") as any;
        const totals = detail?.totals ?? null;

        const buyTotal = roundMoney(parseNum(totals?.buy_total));
        let sellSubtotal = roundMoney(parseNum(totals?.sell_total));
        const vatPercent = parseNum(totals?.sell_vat_percent ?? r.vat_percent);
        let vatAmount = roundMoney(parseNum(totals?.sell_vat_amount));
        let finalTotal = roundMoney(parseNum(totals?.sell_total_with_vat));
        const marginPercent = parseNum(r.margin_percent);

        // SERVICE REQUEST sell/final override (mirrors getServiceRequestClientTotal):
        // client_sell_override_total is the client-facing FINAL figure. Treat it as
        // the final total and back-derive the ex-VAT subtotal + VAT amount at the
        // snapshot VAT rate so the row's VAT identity still holds.
        const overrideRaw =
            r.document_type === "SERVICE_REQUEST" &&
            r.client_sell_override_total !== null &&
            r.client_sell_override_total !== ""
                ? r.client_sell_override_total
                : null;
        const sellOverridden = overrideRaw !== null;
        if (sellOverridden) {
            finalTotal = roundMoney(parseNum(overrideRaw));
            sellSubtotal = roundMoney(finalTotal / (1 + vatPercent / 100));
            vatAmount = roundMoney(finalTotal - sellSubtotal);
        }

        // margin_amount tracks the COST side: sell-subtotal minus buy. For an
        // override SR this no longer equals the policy margin %, which is fine.
        const marginAmount = roundMoney(sellSubtotal - buyTotal);

        return {
            raw: r,
            buy_total: buyTotal,
            sell_subtotal: sellSubtotal,
            margin_amount: marginAmount,
            margin_percent: marginPercent,
            vat_percent: vatPercent,
            vat_amount: vatAmount,
            final_total: finalTotal,
            sell_overridden: sellOverridden,
        };
    });

    // ── Columns. BUY TOTAL / MARGIN AMOUNT / MARGIN % gated on canSeeMargin.
    //    Build column list + per-row cells in lockstep so indices stay aligned.
    const showMargin = ctx.canSeeMargin && !ctx.isClientMount;

    const columns: ReportColumn[] = [
        { header: "DOCUMENT TYPE", width: 16 },
        { header: "KADENCE REFERENCE", width: 20 },
        { header: "DOCUMENT DATE", width: 14 },
        { header: "COMPANY", width: 24 },
        { header: "CONTEXT NAME", width: 30 },
        { header: "OPERATIONAL STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
    ];
    if (showMargin) columns.push({ header: "BUY TOTAL", width: 14, align: "right", numFmt: MONEY_FMT });
    columns.push({ header: "SELL SUBTOTAL", width: 14, align: "right", numFmt: MONEY_FMT });
    if (showMargin) {
        columns.push({ header: "MARGIN AMOUNT", width: 14, align: "right", numFmt: MONEY_FMT });
        columns.push({ header: "MARGIN %", width: 10, align: "right", numFmt: INT_FMT });
    }
    columns.push({ header: "VAT %", width: 8, align: "right", numFmt: INT_FMT });
    columns.push({ header: "VAT AMOUNT", width: 13, align: "right", numFmt: MONEY_FMT });
    columns.push({ header: "FINAL TOTAL", width: 14, align: "right", numFmt: MONEY_FMT });
    columns.push({ header: "INVOICE NUMBER", width: 18 });
    columns.push({ header: "INVOICE DATE", width: 14 });
    columns.push({ header: "PAYMENT STATUS", width: 15 });
    columns.push({ header: "PAID DATE", width: 14 });
    columns.push({ header: "PAYMENT METHOD", width: 16 });
    columns.push({ header: "PAYMENT REFERENCE", width: 20 });

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Accounts Reconciliation",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Reconciliation",
    });
    const sheet = h.sheet;

    // Resolve 1-based money column indices for the grand-total SUM() formula.
    const colIdx = (header: string) => columns.findIndex((c) => c.header === header) + 1;
    const BUY_COL = showMargin ? colIdx("BUY TOTAL") : 0;
    const SELL_COL = colIdx("SELL SUBTOTAL");
    const MARGIN_COL = showMargin ? colIdx("MARGIN AMOUNT") : 0;
    const VATAMT_COL = colIdx("VAT AMOUNT");
    const FINAL_COL = colIdx("FINAL TOTAL");

    const paymentStatus = (r: RawRow): string => {
        if (r.invoice_paid_at) return "PAID";
        if (r.invoice_number) return "INVOICED";
        return "UNINVOICED";
    };

    let firstData = 0;
    let lastData = 0;
    for (const c of computed) {
        const r = c.raw;
        const cells: (string | number)[] = [
            r.document_type,
            r.reference,
            fmtDate(r.document_date),
            r.company ?? "",
            r.context_name ?? "",
            r.operational_status ?? "",
            r.financial_status ?? "",
        ];
        if (showMargin) cells.push(c.buy_total);
        cells.push(c.sell_subtotal);
        if (showMargin) {
            cells.push(c.margin_amount);
            cells.push(c.margin_percent);
        }
        cells.push(c.vat_percent);
        cells.push(c.vat_amount);
        cells.push(c.final_total);
        cells.push(r.invoice_number ?? "");
        cells.push(r.invoice_date ? fmtDate(r.invoice_date) : "");
        cells.push(paymentStatus(r));
        cells.push(r.invoice_paid_at ? fmtDate(r.invoice_paid_at) : "");
        cells.push(r.payment_method ?? "");
        cells.push(r.payment_reference ?? "");

        const row = sheet.addRow(cells);
        if (!firstData) firstData = row.number;
        lastData = row.number;
    }

    if (computed.length > 0) {
        // One row per document — there are no per-group subtotals, so the grand
        // total is a direct SUM over the data range. Grand totals reduce over the
        // already-rounded per-row numbers (per the spec's required fix) so the
        // cached result never drifts from PricingService's billable/voided logic.
        const reduceSum = (sel: (c: Computed) => number) =>
            roundMoney(computed.reduce((n, c) => n + sel(c), 0));

        const grand = sheet.addRow([]);
        grand.getCell(1).value = `GRAND TOTAL — ${ctx.companyName}`;
        grand.font = { bold: true, size: 12 };
        grand.height = 20;
        grand.eachCell({ includeEmpty: true }, (cell) => (cell.fill = STYLE.GRAND_FILL));

        const setSum = (col: number, cached: number) => {
            if (!col) return;
            const L = colLetter(col - 1);
            grand.getCell(col).value = {
                formula: firstData ? `SUM(${L}${firstData}:${L}${lastData})` : "0",
                result: cached,
            };
            grand.getCell(col).numFmt = MONEY_FMT;
        };

        if (showMargin) setSum(BUY_COL, reduceSum((c) => c.buy_total));
        setSum(SELL_COL, reduceSum((c) => c.sell_subtotal));
        if (showMargin) setSum(MARGIN_COL, reduceSum((c) => c.margin_amount));
        setSum(VATAMT_COL, reduceSum((c) => c.vat_amount));
        setSum(FINAL_COL, reduceSum((c) => c.final_total));
    }

    finalizeWorkbook(h, computed.length);
    return { wb: h.wb, rowCount: computed.length };
}

export const accountsReconciliationReport: ReportDefinition = {
    key: "accounts-reconciliation",
    label: "Accounts Reconciliation",
    description:
        "Per-document financial reconciliation ledger (orders + service requests) showing quoted buy / sell / margin / VAT / final totals from the pricing snapshot alongside the latest invoice and payment status, so finance can reconcile what was quoted vs invoiced vs paid. ADMIN-only.",
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
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint: "narrow by date range, financial status, or category",
    },
    run,
};
