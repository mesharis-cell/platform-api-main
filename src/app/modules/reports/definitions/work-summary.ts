/**
 * Work Summary — per-order BUY-side cost summary for one company: the amount the
 * platform owes the warehouse for each fulfilled order (base operations + catalog
 * + custom line-item costs), so logistics/admin can reconcile and the warehouse
 * can raise its own invoice to the platform. Ported from the canonical CLI
 * service (export.services.ts:exportWorkSummaryService); SQL re-parameterized to
 * bound placeholders.
 *
 * AUDIENCE: ADMIN (the card is admin-section), but the operations mount allows
 * LOGISTICS too (the warehouse runs it). ALL FOUR money columns are BUY/cost
 * figures (OPS TOTAL / CATALOG ITEMS / CUSTOM ITEMS / TOTAL BUY COST), computed
 * via PricingService.projectByRole(pricing,'LOGISTICS'). They are therefore
 * gated on ctx.canSeeMargin and physically dropped when the caller can't see
 * cost. There is no sell column on this report — without margin visibility the
 * money block is omitted entirely and only the order-header columns render.
 * (Spec appendix "Work Summary": "Buy figures only, never sell/margin".)
 *
 * Money is computed in app code (NOT a SQL SUM) because the projection applies
 * shouldCountInTotals + logistics_visible + voided filtering before bucketing
 * into base-ops / RATE_CARD(catalog) / CUSTOM. Grain is one row per order — the
 * core path has NO fan-out (orders⋈prices is N:1), so the additive money columns
 * get a real grand-total. Optional category/group filters are EXISTS subqueries
 * into order_items→assets (orders have no category/group of their own); per the
 * spec required fix, a per-category run is NOT additive (the order's FULL buy
 * cost is counted whenever ANY item matches) — surfaced in the subtitle.
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

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        status: z.union([z.string(), z.array(z.string())]).optional(),
        group_id: z.string().uuid().optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .refine((v) => !(v.category_include && v.category_exclude), {
        message: "category_include and category_exclude are mutually exclusive",
    });

/**
 * Generic, tenant-agnostic category filter. Orders have no category, so the
 * filter is a document-level EXISTS into order_items → assets.category (alias
 * "a" inside the subquery). Mirrors issuance.ts categoryFilter() semantics
 * (LOWER(COALESCE(...)) IN/NOT IN, case-insensitive, silent no-op when empty).
 */
function categoryFilter(inc: string[], exc: string[]): SQL {
    const col = sql.raw("LOWER(COALESCE(a.category, ''))");
    if (inc.length)
        return sql` AND EXISTS (
            SELECT 1 FROM order_items oi JOIN assets a ON oi.asset = a.id
            WHERE oi."order" = o.id AND ${col} IN (${sql.join(
                inc.map((c) => sql`${c.toLowerCase()}`),
                sql`, `
            )}))`;
    if (exc.length)
        return sql` AND EXISTS (
            SELECT 1 FROM order_items oi JOIN assets a ON oi.asset = a.id
            WHERE oi."order" = o.id AND ${col} NOT IN (${sql.join(
                exc.map((c) => sql`${c.toLowerCase()}`),
                sql`, `
            )}))`;
    return sql``;
}

/** Group filter is likewise document-level EXISTS into order_items → assets.group_id. */
function groupFilter(groupId: string | undefined): SQL {
    if (!groupId) return sql``;
    return sql` AND EXISTS (
        SELECT 1 FROM order_items oi JOIN assets a ON oi.asset = a.id
        WHERE oi."order" = o.id AND a.group_id = ${groupId})`;
}

function dateFilter(expr: SQL, gte: Date | null, lt: Date | null): SQL {
    const parts: SQL[] = [];
    if (gte) parts.push(sql` AND ${expr} >= ${gte}`);
    if (lt) parts.push(sql` AND ${expr} < ${lt}`);
    return parts.length ? sql.join(parts, sql``) : sql``;
}

/**
 * Default scope is the fidelity-correct "work actually incurred" set per the
 * spec appendix (IN_PREPARATION onward — the outbound-prep phase has begun),
 * which is TIGHTER than the legacy service's NOT IN ('DRAFT','CANCELLED'). An
 * explicit :status list overrides this with an exact-match IN list.
 */
const WORK_INCURRED_STATUSES = [
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

function statusFilter(statuses: string[]): SQL {
    if (statuses.length)
        return sql` AND o.order_status IN (${sql.join(
            statuses.map((s) => sql`${s}`),
            sql`, `
        )})`;
    return sql` AND o.order_status IN (${sql.join(
        WORK_INCURRED_STATUSES.map((s) => sql`${s}`),
        sql`, `
    )})`;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const statuses = toArr(params.status);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);

    // One row per order. Core path is N:1 all the way (orders→companies→brands→
    // prices) — NO fan-out, so the additive money columns get a real column SUM.
    // The date window matches the legacy service: on the order's event window.
    const query = sql`
SELECT
    o.id AS order_uuid,
    o.order_id AS order_ref,
    co.name AS company_name,
    b.name AS brand_name,
    o.event_start_date,
    o.event_end_date,
    o.order_status,
    o.financial_status,
    o.job_number,
    o.po_number,
    p.breakdown_lines,
    p.margin_percent,
    p.vat_percent,
    p.margin_is_override,
    p.margin_override_reason,
    p.calculated_at
FROM orders o
LEFT JOIN companies co ON o.company = co.id
LEFT JOIN brands b ON o.brand = b.id
LEFT JOIN prices p ON o.order_pricing_id = p.id
WHERE o.platform_id = ${ctx.platformId} AND o.company = ${ctx.companyId}
  AND o.deleted_at IS NULL
  ${statusFilter(statuses)}
  ${cat}
  ${groupFilter(params.group_id)}
  ${dateFilter(sql.raw("o.event_start_date"), gte, lt)}
ORDER BY o.event_start_date ASC, o.order_id ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Work summary has ${rows.length} orders (cap ${ROW_CAP}). Narrow by date range, status, category, or group.`
        );

    // Every money column is a BUY/cost figure → gate on canSeeMargin and never
    // build them on the client mount (this report is admin/logistics only anyway).
    const showCost = ctx.canSeeMargin && !ctx.isClientMount;

    const columns: ReportColumn[] = [
        { header: "ORDER ID", width: 20 },
        { header: "COMPANY", width: 22 },
        { header: "BRAND", width: 18 },
        { header: "EVENT START", width: 13 },
        { header: "EVENT END", width: 13 },
        { header: "STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
        { header: "JOB NUMBER", width: 16 },
        { header: "PO NUMBER", width: 16 },
    ];
    // 1-based column indices for the four BUY money columns (only when shown).
    const OPS = 10;
    const CATALOG = 11;
    const CUSTOM = 12;
    const TOTAL = 13;
    // Label host for the grand-total row — PO NUMBER column (last header column).
    const LABEL = 9;
    if (showCost) {
        columns.push(
            { header: "OPS TOTAL", width: 14, align: "right", numFmt: MONEY_FMT },
            { header: "CATALOG ITEMS", width: 14, align: "right", numFmt: MONEY_FMT },
            { header: "CUSTOM ITEMS", width: 14, align: "right", numFmt: MONEY_FMT },
            { header: "TOTAL BUY COST", width: 16, align: "right", numFmt: MONEY_FMT }
        );
    }

    // Subtitle: date range + a non-additivity warning when a category/group
    // filter narrows the set (the full order buy cost counts whenever ANY item
    // matches — per-category runs do NOT sum to the unfiltered grand total).
    const filteredByItem = inc.length > 0 || exc.length > 0 || !!params.group_id;
    const subtitle = filteredByItem
        ? `${fmtRangeLabel(params.date_from, params.date_to)} — NOTE: category/group filter is document-level; per-filter runs are NOT additive (full order cost counted when ANY item matches)`
        : fmtRangeLabel(params.date_from, params.date_to);

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Work Summary",
        subtitle,
        columns,
        sheetName: "Work Summary",
    });
    const sheet = h.sheet;

    let opsSum = 0;
    let catalogSum = 0;
    let customSum = 0;
    let totalSum = 0;

    for (const r of rows) {
        const cells: (string | number)[] = [
            r.order_ref ?? "",
            r.company_name ?? "",
            r.brand_name ?? "",
            fmtDate(r.event_start_date),
            fmtDate(r.event_end_date),
            r.order_status ?? "",
            r.financial_status ?? "",
            r.job_number ?? "",
            r.po_number ?? "",
        ];

        if (showCost) {
            // BUY-side projection. base_ops_total + line_items.catalog_total +
            // line_items.custom_total = final_total (buy_total), per
            // pricing.service.ts calculateBreakdownTotals.
            const projected = PricingService.projectByRole(r as any, "LOGISTICS") as any;
            const ops = roundMoney(parseNum(projected?.base_ops_total));
            const catalog = roundMoney(parseNum(projected?.line_items?.catalog_total));
            const custom = roundMoney(parseNum(projected?.line_items?.custom_total));
            const totalBuy = roundMoney(parseNum(projected?.final_total));
            opsSum += ops;
            catalogSum += catalog;
            customSum += custom;
            totalSum += totalBuy;
            cells.push(ops, catalog, custom, totalBuy);
        }

        sheet.addRow(cells);
    }

    // Grand-total footer. One row per order with no fan-out → the four BUY
    // columns are genuinely additive and get a real column SUM. Cached totals
    // are accumulated over already-rounded per-row numbers to avoid float drift.
    if (rows.length > 0 && showCost) {
        const firstDataRow = h.headerRow + 1;
        const lastDataRow = h.headerRow + rows.length;
        addGrandTotalRow(sheet, {
            label: `GRAND TOTAL — ${ctx.companyName} (${rows.length} orders)`,
            labelCol: LABEL,
            sums: [
                { col: OPS, subtotalRows: [], cached: roundMoney(opsSum) },
                { col: CATALOG, subtotalRows: [], cached: roundMoney(catalogSum) },
                { col: CUSTOM, subtotalRows: [], cached: roundMoney(customSum) },
                { col: TOTAL, subtotalRows: [], cached: roundMoney(totalSum) },
            ],
        });
        // addGrandTotalRow emits SUM(refs) with refs="" → "0"; rewrite each money
        // column to a true column SUM over the data rows (additive at order grain).
        const grandRow = sheet.getRow(lastDataRow + 1);
        const writeColSum = (col: number, cached: number) => {
            const L = colLetter(col - 1);
            grandRow.getCell(col).value = {
                formula: `SUM(${L}${firstDataRow}:${L}${lastDataRow})`,
                result: roundMoney(cached),
            };
        };
        writeColSum(OPS, opsSum);
        writeColSum(CATALOG, catalogSum);
        writeColSum(CUSTOM, customSum);
        writeColSum(TOTAL, totalSum);
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const workSummaryReport: ReportDefinition = {
    key: "work-summary",
    label: "Work Summary",
    description:
        "Per-order buy-side cost summary — the amount the platform owes the warehouse for each fulfilled order (base operations + catalog + custom line-item costs) — so the warehouse can reconcile and raise its own invoice. Cost figures are admin-only (margin-visible callers); no sell or margin columns ever appear.",
    section: "OPERATIONS",
    audience: "ADMIN",
    operationsRoles: ["ADMIN", "LOGISTICS"],
    permissions: ["orders:export"],
    filters: [
        { key: "company_id", label: "Company", type: "company", required: true },
        { key: "date_from", label: "From", type: "date", required: false },
        { key: "date_to", label: "To", type: "date", required: false },
        { key: "status", label: "Order Status", type: "status", required: false },
        { key: "group_id", label: "Group", type: "group", required: false, scope: "document" },
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
        narrowHint: "narrow by date range, status, category, or group",
    },
    run,
};
