/**
 * Issuance Log — per-document log of physical items issued (orders +
 * self-pickups), grouped with subtotals + grand total, OUTCOME colour-coded,
 * PERMANENT flag, COMMENTS (collector). Ported from the canonical CLI script
 * (src/db/scripts/export-issuance.ts); SQL re-parameterized to bound placeholders.
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
    addGrandTotalRow,
    addSubtotalRow,
    colourOutcome,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    fmtRangeLabel,
    INT_FMT,
    ReportColumn,
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

    const query = sql`
WITH order_returns AS (
    SELECT sea.asset_id, se."order"::uuid AS order_id, SUM(sea.quantity)::int AS returned_qty
    FROM scan_event_assets sea JOIN scan_events se ON sea.scan_event_id = se.id
    WHERE se.scan_type = 'INBOUND' AND se."order" IS NOT NULL
    GROUP BY sea.asset_id, se."order"
),
order_outbound_at AS (
    SELECT se."order"::uuid AS order_id, MAX(se.scanned_at) AS issued_at
    FROM scan_events se WHERE se.scan_type = 'OUTBOUND' AND se."order" IS NOT NULL
    GROUP BY se."order"
),
order_consumed AS (
    SELECT sm.asset_id, sm.linked_entity_id::uuid AS order_id, SUM(ABS(sm.delta))::int AS consumed_qty
    FROM stock_movements sm
    WHERE sm.movement_type = 'WRITE_OFF' AND sm.write_off_reason = 'CONSUMED' AND sm.linked_entity_type = 'ORDER'
    GROUP BY sm.asset_id, sm.linked_entity_id
),
sp_returns AS (
    SELECT sea.asset_id, se.self_pickup_id, SUM(sea.quantity)::int AS returned_qty
    FROM scan_event_assets sea JOIN scan_events se ON sea.scan_event_id = se.id
    WHERE se.scan_type = 'INBOUND' AND se.self_pickup_id IS NOT NULL
    GROUP BY sea.asset_id, se.self_pickup_id
),
sp_outbound_at AS (
    SELECT se.self_pickup_id, MAX(se.scanned_at) AS issued_at
    FROM scan_events se WHERE se.scan_type = 'OUTBOUND' AND se.self_pickup_id IS NOT NULL
    GROUP BY se.self_pickup_id
),
sp_consumed AS (
    SELECT sm.asset_id, sm.linked_entity_id::uuid AS sp_id, SUM(ABS(sm.delta))::int AS consumed_qty
    FROM stock_movements sm
    WHERE sm.movement_type = 'WRITE_OFF' AND sm.write_off_reason = 'CONSUMED' AND sm.linked_entity_type = 'SELF_PICKUP'
    GROUP BY sm.asset_id, sm.linked_entity_id
)
SELECT
    COALESCE(ooa.issued_at, o.created_at) AS doc_date,
    'DELIVERY' AS type, o.order_id AS reference,
    o.venue_name AS venue, c.name AS city, u.name AS user_name,
    o.is_permanent_placement AS is_permanent,
    af.company_item_code AS company_item_code,
    COALESCE(af.name, oi.asset_name) AS description,
    t.name AS team_name, oi.quantity AS delivered_qty,
    COALESCE(ret.returned_qty, 0) AS returned_qty,
    CASE
        WHEN COALESCE(ret.returned_qty,0) >= oi.quantity THEN 'RETURNED'
        WHEN COALESCE(ret.returned_qty,0) > 0 THEN 'PARTIAL'
        WHEN COALESCE(con.consumed_qty,0) > 0 THEN 'CONSUMED'
        ELSE 'OUT' END AS outcome,
    '' AS comments
FROM orders o
JOIN order_items oi ON oi."order" = o.id
LEFT JOIN users u ON o.created_by = u.id
LEFT JOIN cities c ON o.venue_city_id = c.id
LEFT JOIN assets a ON oi.asset = a.id
LEFT JOIN legacy_asset_families af ON a.group_id = af.id
LEFT JOIN teams t ON a.team_id = t.id
LEFT JOIN order_returns ret ON ret.asset_id = oi.asset AND ret.order_id = o.id
LEFT JOIN order_consumed con ON con.asset_id = oi.asset AND con.order_id = o.id
LEFT JOIN order_outbound_at ooa ON ooa.order_id = o.id
WHERE o.platform_id = ${ctx.platformId} AND o.company = ${ctx.companyId}
  AND o.order_status IN ('READY_FOR_DELIVERY','IN_TRANSIT','DELIVERED','IN_USE','DERIG','AWAITING_RETURN','RETURN_IN_TRANSIT','CLOSED')
  ${cat}
  ${dateFilter(sql.raw("COALESCE(ooa.issued_at, o.created_at)"), gte, lt)}

UNION ALL

SELECT
    COALESCE(spo.issued_at, sp.created_at) AS doc_date,
    'SELF-PICKUP' AS type, sp.self_pickup_id AS reference,
    '' AS venue, '' AS city,
    COALESCE(u.name, sp.collector_name) AS user_name,
    sp.is_permanent_placement AS is_permanent,
    af.company_item_code AS company_item_code,
    COALESCE(af.name, spi.asset_name) AS description,
    t.name AS team_name,
    CASE WHEN spi.skipped THEN 0 WHEN spi.scanned_quantity IS NULL THEN spi.quantity ELSE spi.scanned_quantity END AS delivered_qty,
    COALESCE(spret.returned_qty, 0) AS returned_qty,
    CASE
        WHEN spi.skipped THEN 'OUT'
        WHEN (CASE WHEN spi.scanned_quantity IS NULL THEN spi.quantity ELSE spi.scanned_quantity END) = 0 THEN 'OUT'
        WHEN COALESCE(spret.returned_qty,0) >= (CASE WHEN spi.scanned_quantity IS NULL THEN spi.quantity ELSE spi.scanned_quantity END) THEN 'RETURNED'
        WHEN COALESCE(spret.returned_qty,0) > 0 THEN 'PARTIAL'
        WHEN COALESCE(spcon.consumed_qty,0) > 0 THEN 'CONSUMED'
        ELSE 'OUT' END AS outcome,
    CASE WHEN sp.collector_name IS NOT NULL AND sp.collector_name != '' THEN 'Collector: ' || sp.collector_name ELSE '' END AS comments
FROM self_pickups sp
JOIN self_pickup_items spi ON spi.self_pickup_id = sp.id
LEFT JOIN users u ON sp.created_by = u.id
LEFT JOIN assets a ON spi.asset_id = a.id
LEFT JOIN legacy_asset_families af ON a.group_id = af.id
LEFT JOIN teams t ON a.team_id = t.id
LEFT JOIN sp_returns spret ON spret.asset_id = spi.asset_id AND spret.self_pickup_id = sp.id
LEFT JOIN sp_consumed spcon ON spcon.asset_id = spi.asset_id AND spcon.sp_id = sp.id
LEFT JOIN sp_outbound_at spo ON spo.self_pickup_id = sp.id
WHERE sp.platform_id = ${ctx.platformId} AND sp.company_id = ${ctx.companyId}
  AND sp.self_pickup_status IN ('PICKED_UP','AWAITING_RETURN','CLOSED') AND NOT spi.skipped
  ${cat}
  ${dateFilter(sql.raw("COALESCE(spo.issued_at, sp.created_at)"), gte, lt)}

ORDER BY doc_date ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Issuance log has ${rows.length} rows (cap ${ROW_CAP}). Narrow by date range or category.`
        );

    const columns: ReportColumn[] = [
        { header: "DATE", width: 13 },
        { header: "TYPE", width: 13 },
        { header: "KADENCE REFERENCE", width: 20 },
        { header: "VENUE", width: 28 },
        { header: "CITY", width: 13 },
        { header: "USER", width: 20 },
        { header: "PERMANENT", width: 11 },
        { header: `${ctx.companyName.toUpperCase()} ITEM CODE`, width: 22 },
        { header: "ITEM DESCRIPTION", width: 44 },
        { header: "TEAM", width: 18 },
        { header: "QUANTITY", width: 11, align: "right", numFmt: INT_FMT },
        { header: "OUTCOME", width: 12 },
        { header: "RETURNED QTY", width: 13, align: "right", numFmt: INT_FMT },
        { header: "COMMENTS", width: 28 },
    ];
    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Issuance Log",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Issuance",
    });
    const sheet = h.sheet;
    const QTY = 11;
    const RET = 13;
    const LABEL = 9;

    const groups = new Map<string, any[]>();
    for (const r of rows) {
        const ref = String(r.reference);
        if (!groups.has(ref)) groups.set(ref, []);
        groups.get(ref)!.push(r);
    }

    const subRows: number[] = [];
    for (const [ref, gr] of groups) {
        let first = 0;
        let last = 0;
        for (const r of gr) {
            const row = sheet.addRow([
                fmtDate(r.doc_date),
                r.type,
                r.reference,
                r.venue ?? "",
                r.city ?? "",
                r.user_name ?? "",
                r.is_permanent ? "YES" : "NO",
                r.company_item_code ?? "",
                r.description ?? "",
                r.team_name ?? "",
                Number(r.delivered_qty) || 0,
                r.outcome,
                Number(r.returned_qty) || 0,
                r.comments ?? "",
            ]);
            colourOutcome(row.getCell(12), String(r.outcome));
            if (!first) first = row.number;
            last = row.number;
        }
        const sub = addSubtotalRow(sheet, {
            label: `Subtotal — ${ref}`,
            labelCol: LABEL,
            sums: [
                {
                    col: QTY,
                    from: first,
                    to: last,
                    cached: gr.reduce((n, r) => n + (Number(r.delivered_qty) || 0), 0),
                },
                {
                    col: RET,
                    from: first,
                    to: last,
                    cached: gr.reduce((n, r) => n + (Number(r.returned_qty) || 0), 0),
                },
            ],
        });
        subRows.push(sub.number);
        sheet.addRow([]);
    }

    addGrandTotalRow(sheet, {
        label: `GRAND TOTAL — ${ctx.companyName}`,
        labelCol: LABEL,
        sums: [
            {
                col: QTY,
                subtotalRows: subRows,
                cached: rows.reduce((n, r) => n + (Number(r.delivered_qty) || 0), 0),
            },
            {
                col: RET,
                subtotalRows: subRows,
                cached: rows.reduce((n, r) => n + (Number(r.returned_qty) || 0), 0),
            },
        ],
    });

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const issuanceReport: ReportDefinition = {
    key: "issuance",
    label: "Issuance Log",
    description:
        "Per-document log of physical items issued (orders + self-pickups) with lifecycle outcome, owning team, and the permanent-placement flag. Grouped by document with subtotals.",
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
    ],
    paramsSchema,
    rowCap: { max: ROW_CAP, dimension: "rows", narrowHint: "narrow by date range or category" },
    run,
};
