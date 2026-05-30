/**
 * Overdue / Outstanding Returns — net-new operational report (no legacy CSV).
 * See docs/reports-system-direction.md §12 ("biggest operational gap").
 *
 * One row per still-out item past its expected return date:
 *   - ORDERS (DELIVERY): expected return = event_end_date + RETURN_BUFFER_DAYS
 *     (mirrors computeBookingWindow → asset_bookings.blocked_until math in
 *     order.utils.ts:174). Outstanding qty = order_item.quantity − returned_qty.
 *   - SELF-PICKUPS (SELF-PICKUP): expected return = self_pickups.expected_return_at
 *     (the cron's AWAITING_RETURN trigger signal, schema.ts:2121). Outstanding qty
 *     = handover qty (scanned_quantity ?? quantity) − returned_qty.
 *
 * Returned qty comes from INBOUND scan_event_assets (same CTEs as issuance).
 * Permanent placements + skipped SP lines are excluded (no return expected).
 * Only rows where outstanding > 0 AND expected_return < now() AND not yet
 * closed/returned are emitted.
 *
 * Snapshot report → asOfLabel. No money columns → client-safe; ADMIN_CLIENT.
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import {
    asOfLabel,
    colourOutcome,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    INT_FMT,
    ReportColumn,
} from "../../../utils/report-workbook";

const ROW_CAP = 10000;

// Mirrors RETURN_BUFFER_DAYS in order.utils.ts:146 (kept in sync; orders'
// blocked_until = event_end + this many days).
const RETURN_BUFFER_DAYS = 3;

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .refine((v) => !(v.category_include && v.category_exclude), {
        message: "category_include and category_exclude are mutually exclusive",
    });

/** Generic, tenant-agnostic category filter against assets.category (alias "a"). */
function categoryFilter(inc: string[], exc: string[]): SQL {
    const col = sql.raw("LOWER(COALESCE(a.category, ''))");
    if (inc.length)
        return sql` AND ${col} IN (${sql.join(
            inc.map((c) => sql`${c.toLowerCase()}`),
            sql`, `
        )})`;
    if (exc.length)
        return sql` AND ${col} NOT IN (${sql.join(
            exc.map((c) => sql`${c.toLowerCase()}`),
            sql`, `
        )})`;
    return sql``;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const cat = categoryFilter(inc, exc);
    const now = ctx.now;

    const query = sql`
WITH order_returns AS (
    SELECT sea.asset_id, se."order"::uuid AS order_id, SUM(sea.quantity)::int AS returned_qty
    FROM scan_event_assets sea JOIN scan_events se ON sea.scan_event_id = se.id
    WHERE se.scan_type = 'INBOUND' AND se."order" IS NOT NULL
    GROUP BY sea.asset_id, se."order"
),
sp_returns AS (
    SELECT sea.asset_id, se.self_pickup_id, SUM(sea.quantity)::int AS returned_qty
    FROM scan_event_assets sea JOIN scan_events se ON sea.scan_event_id = se.id
    WHERE se.scan_type = 'INBOUND' AND se.self_pickup_id IS NOT NULL
    GROUP BY sea.asset_id, se.self_pickup_id
)
SELECT * FROM (
    SELECT
        'DELIVERY' AS type,
        o.order_id AS reference,
        o.venue_name AS who,
        af.company_item_code AS company_item_code,
        COALESCE(af.name, oi.asset_name) AS description,
        (o.event_end_date + (${RETURN_BUFFER_DAYS} * INTERVAL '1 day')) AS expected_return,
        (oi.quantity - COALESCE(ret.returned_qty, 0)) AS outstanding_qty
    FROM orders o
    JOIN order_items oi ON oi."order" = o.id
    LEFT JOIN assets a ON oi.asset = a.id
    LEFT JOIN legacy_asset_families af ON a.group_id = af.id
    LEFT JOIN order_returns ret ON ret.asset_id = oi.asset AND ret.order_id = o.id
    WHERE o.platform_id = ${ctx.platformId} AND o.company = ${ctx.companyId}
      AND o.deleted_at IS NULL
      AND o.is_permanent_placement = false
      AND o.order_status IN ('READY_FOR_DELIVERY','IN_TRANSIT','DELIVERED','IN_USE','DERIG','AWAITING_RETURN','RETURN_IN_TRANSIT')
      ${cat}

    UNION ALL

    SELECT
        'SELF-PICKUP' AS type,
        sp.self_pickup_id AS reference,
        sp.collector_name AS who,
        af.company_item_code AS company_item_code,
        COALESCE(af.name, spi.asset_name) AS description,
        sp.expected_return_at AS expected_return,
        ((CASE WHEN spi.scanned_quantity IS NULL THEN spi.quantity ELSE spi.scanned_quantity END)
            - COALESCE(spret.returned_qty, 0)) AS outstanding_qty
    FROM self_pickups sp
    JOIN self_pickup_items spi ON spi.self_pickup_id = sp.id
    LEFT JOIN assets a ON spi.asset_id = a.id
    LEFT JOIN legacy_asset_families af ON a.group_id = af.id
    LEFT JOIN sp_returns spret ON spret.asset_id = spi.asset_id AND spret.self_pickup_id = sp.id
    WHERE sp.platform_id = ${ctx.platformId} AND sp.company_id = ${ctx.companyId}
      AND sp.deleted_at IS NULL
      AND sp.is_permanent_placement = false
      AND NOT spi.skipped
      AND sp.expected_return_at IS NOT NULL
      AND sp.self_pickup_status IN ('PICKED_UP','AWAITING_RETURN')
      ${cat}
) rows
WHERE outstanding_qty > 0
  AND expected_return IS NOT NULL
  AND expected_return < ${now}
ORDER BY expected_return ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Overdue returns has ${rows.length} rows (cap ${ROW_CAP}). Narrow by category.`
        );

    const DAY_MS = 24 * 60 * 60 * 1000;
    const agingBucket = (days: number): string => {
        if (days <= 7) return "0-7";
        if (days <= 30) return "8-30";
        if (days <= 60) return "31-60";
        return "60+";
    };

    const columns: ReportColumn[] = [
        { header: "KADENCE REFERENCE", width: 20 },
        { header: "TYPE", width: 13 },
        { header: "VENUE / COLLECTOR", width: 28 },
        { header: `${ctx.companyName.toUpperCase()} ITEM CODE`, width: 22 },
        { header: "ITEM DESCRIPTION", width: 44 },
        { header: "QTY OUTSTANDING", width: 15, align: "right", numFmt: INT_FMT },
        { header: "EXPECTED RETURN", width: 15 },
        { header: "DAYS OVERDUE", width: 13, align: "right", numFmt: INT_FMT },
        { header: "AGING BUCKET", width: 13 },
    ];

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Overdue / Outstanding Returns",
        subtitle: asOfLabel(ctx.now),
        columns,
        sheetName: "Overdue Returns",
    });
    const sheet = h.sheet;
    const DAYS_COL = 8; // 1-based index of DAYS OVERDUE

    for (const r of rows) {
        const expected = r.expected_return ? new Date(r.expected_return) : null;
        const daysOverdue =
            expected && !isNaN(expected.getTime())
                ? Math.max(0, Math.floor((now.getTime() - expected.getTime()) / DAY_MS))
                : 0;
        const row = sheet.addRow([
            r.reference,
            r.type,
            r.who ?? "",
            r.company_item_code ?? "",
            r.description ?? "",
            Number(r.outstanding_qty) || 0,
            fmtDate(r.expected_return),
            daysOverdue,
            agingBucket(daysOverdue),
        ]);
        colourOutcome(row.getCell(DAYS_COL), "OVERDUE");
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const overdueReturnsReport: ReportDefinition = {
    key: "overdue-returns",
    label: "Overdue / Outstanding Returns",
    description:
        "One row per still-out item past its expected return — orders (event end + return buffer) and self-pickups (expected return date) where outstanding quantity has not yet come back. Days-overdue and aging buckets surface the late-fee / lost-item recovery queue.",
    section: "OPERATIONS",
    audience: "ADMIN_CLIENT",
    permissions: ["orders:export", "orders:read"],
    filters: [
        { key: "company_id", label: "Company", type: "company", required: true },
        {
            key: "category",
            label: "Category",
            type: "category-include-exclude",
            required: false,
            mode: "include-exclude",
            scope: "item",
        },
    ],
    paramsSchema,
    rowCap: { max: ROW_CAP, dimension: "rows", narrowHint: "narrow by category" },
    run,
};
