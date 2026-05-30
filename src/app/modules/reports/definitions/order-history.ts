/**
 * Order History — one-row-per-order current-state snapshot (NOT a per-transition
 * LAG timeline; that's an open product decision, kept simple for v1). Ported from
 * the legacy CLI/export path (export.services.ts:212 exportOrderHistoryService),
 * SQL re-parameterized to bound placeholders.
 *
 * The legacy CSV projected the FINAL TOTAL via the ADMIN role projection — but
 * projectSummaryForRole's `final_total` is the SELL figure (sell_total_with_vat)
 * for both ADMIN and CLIENT, so it is client-safe by construction. There are NO
 * cost/margin/buy columns in this report → ADMIN_CLIENT, no leak. We still pass a
 * role-aware projection (CLIENT on the client mount) as belt-and-suspenders so no
 * internal field can ever ride along.
 *
 * Date filter is on orders.created_at (matches the legacy CSV window semantics).
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { PricingService } from "../../../services/pricing.service";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import {
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    fmtRangeLabel,
    MONEY_FMT,
    parseNum,
    ReportColumn,
} from "../../../utils/report-workbook";

const ROW_CAP = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const paramsSchema = z.object({
    company_id: z.string().uuid(),
    date_from: z.string().regex(DATE_RE).optional(),
    date_to: z.string().regex(DATE_RE).optional(),
});

function dateFilter(expr: SQL, gte: Date | null, lt: Date | null): SQL {
    const parts: SQL[] = [];
    if (gte) parts.push(sql` AND ${expr} >= ${gte}`);
    if (lt) parts.push(sql` AND ${expr} < ${lt}`);
    return parts.length ? sql.join(parts, sql``) : sql``;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);

    // One row per order. Pull the raw pricing record fields projectSummaryForRole
    // needs (breakdown_lines + margin_percent + vat_percent + calculated_at) via
    // the order_pricing_id convenience FK; the FINAL TOTAL is derived in JS so the
    // sell-vs-buy decision stays in the (audited) projection helper.
    const query = sql`
SELECT
    o.order_id AS order_ref,
    o.created_at AS order_date,
    c.name AS company,
    o.venue_name AS event_name,
    o.order_status AS order_status,
    o.financial_status AS financial_status,
    o.event_start_date AS event_start,
    o.event_end_date AS event_end,
    p.breakdown_lines AS breakdown_lines,
    p.margin_percent AS margin_percent,
    p.vat_percent AS vat_percent,
    p.calculated_at AS calculated_at
FROM orders o
LEFT JOIN companies c ON c.id = o."company"
LEFT JOIN prices p ON p.id = o.order_pricing_id
WHERE o.platform_id = ${ctx.platformId}
  AND o."company" = ${ctx.companyId}
  AND o.deleted_at IS NULL
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}
ORDER BY o.created_at DESC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order History has ${rows.length} rows (cap ${ROW_CAP}). Narrow by date range.`
        );

    // FINAL TOTAL is the only money column and is always the SELL figure → safe
    // for clients. Project with the caller's effective role so nothing internal
    // can leak on the client mount.
    const projectionRole = ctx.isClientMount ? "CLIENT" : "ADMIN";

    const columns: ReportColumn[] = [
        { header: "ORDER ID", width: 20 },
        { header: "ORDER DATE", width: 13 },
        { header: "COMPANY", width: 24 },
        { header: "EVENT NAME", width: 28 },
        { header: "ORDER STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
        { header: "EVENT START", width: 13 },
        { header: "EVENT END", width: 13 },
        { header: "FINAL TOTAL", width: 15, align: "right", numFmt: MONEY_FMT },
    ];

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Order History",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Order History",
    });
    const sheet = h.sheet;

    for (const r of rows) {
        const pricing = r.breakdown_lines
            ? {
                  breakdown_lines: r.breakdown_lines,
                  margin_percent: r.margin_percent,
                  vat_percent: r.vat_percent,
                  calculated_at: r.calculated_at,
              }
            : null;
        const summary = PricingService.projectSummaryForRole(pricing as any, projectionRole);
        const finalTotal = summary ? parseNum(summary.final_total) : 0;

        sheet.addRow([
            r.order_ref,
            fmtDate(r.order_date),
            r.company ?? "",
            r.event_name ?? "",
            r.order_status,
            r.financial_status,
            fmtDate(r.event_start),
            fmtDate(r.event_end),
            finalTotal,
        ]);
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const orderHistoryReport: ReportDefinition = {
    key: "order-history",
    label: "Order History",
    description:
        "One row per order: a current-state snapshot of every order for a company (status, financial status, event window) with its sell-side final total. Replaces the legacy order-history CSV. Sell-only — no cost or margin columns, so client-safe.",
    section: "OPERATIONS",
    audience: "ADMIN_CLIENT",
    permissions: ["orders:export", "orders:read"],
    filters: [
        { key: "company_id", label: "Company", type: "company", required: true },
        { key: "date_from", label: "From", type: "date", required: false },
        { key: "date_to", label: "To", type: "date", required: false },
    ],
    paramsSchema,
    rowCap: { max: ROW_CAP, dimension: "rows", narrowHint: "narrow by date range" },
    run,
};
