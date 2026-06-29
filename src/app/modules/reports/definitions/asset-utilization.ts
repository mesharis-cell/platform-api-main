/**
 * Asset Utilization — per-asset-group (family) utilization over a date window:
 * how many asset-days each group was held by active order/self-pickup bookings
 * versus its theoretical available capacity (TOTAL QTY × RANGE DAYS), with a
 * utilization %, distinct-booking/entity counts, and an OUTBOUND-scan cross-check
 * to surface booking-vs-physical data drift. Replaces the flat asset-utilization
 * CSV (export.services.ts:exportAssetUtilizationService), which had NO date
 * window, dropped self-pickups, and computed "uses" as COUNT(DISTINCT
 * scan_events.order_id) — not a real utilization metric.
 *
 * No money columns → client-safe; ADMIN_CLIENT. Self-bookings are NOT in
 * asset_bookings, so booked asset-days UNDER-count physical holds; utilization %
 * is theoretical capacity (no refurb/maintenance downtime subtracted) and can
 * exceed 100. Both caveats are footnoted on the sheet.
 *
 * Numbers-skeptic required fixes applied:
 *  - Overlap pre-filter casts ::date so it matches the clip math (blocked_from/
 *    until are timestamp(mode:date)).
 *  - DISTINCT ENTITIES is a true group-level COUNT(DISTINCT entity) (carries the
 *    order/SP id through the booking CTE), NOT a SUM of per-asset counts.
 *  - Bookings are trusted by EXISTENCE, not a parent-status whitelist: a row
 *    exists IFF the hold is active (release hard-deletes it in the same txn as
 *    the terminal status flip). The status join was redundant and could mask an
 *    orphaned booking; the daily `checkOrphanBookings` cron surfaces violations.
 *  - platform_id is resolved server-side (ctx.platformId), never an unbound param.
 *  - DEFAULT WINDOW = trailing 365 days when no dates given (all-time makes
 *    utilization% meaningless / dominated by ancient bookings).
 *  - Zero-overlap (clipped_days = 0) bookings are excluded from the distinct
 *    counts so DISTINCT BOOKINGS>0 ⇔ BOOKED ASSET-DAYS>0 holds.
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
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    fmtRangeLabel,
    INT_FMT,
    ReportColumn,
} from "../../../utils/report-workbook";

const ROW_CAP = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

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

interface UtilRow {
    group_id: string | null;
    group_name: string | null;
    company_item_code: string | null;
    category: string | null;
    stock_mode: string | null;
    team_name: string | null;
    total_qty: number;
    available_qty: number;
    range_days: number;
    booked_asset_days: number;
    available_asset_days: number;
    distinct_bookings: number;
    distinct_entities: number;
    outbound_scan_qty: number;
    last_outbound: Date | string | null;
    idle_days: number | null;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const cat = categoryFilter(inc, exc);

    // DEFAULT WINDOW: trailing 365 days when no dates given — all-time makes
    // utilization% meaningless (dominated by ancient bookings, huge RANGE DAYS).
    let dateFrom: string | undefined = params.date_from;
    let dateTo: string | undefined = params.date_to;
    if (!dateFrom && !dateTo) {
        const stamp = (d: Date) =>
            new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(d); // YYYY-MM-DD
        const nowMs = ctx.now.getTime();
        dateFrom = stamp(new Date(nowMs - 365 * DAY_MS));
        dateTo = stamp(ctx.now);
    }
    // gte/lt are half-open Dubai-day instants; RANGE DAYS + the clip math run on
    // ::date so they agree with the booking timestamp(mode:date) grain.
    const { gte, lt } = fmtDateBounds(dateFrom, dateTo);

    // Per-group aggregation. Bookings + scans are each pre-aggregated to asset
    // grain in their own CTE BEFORE the group-level SUM, so neither fans out
    // (mirrors export-issuance.ts's order_outbound_at / sp_outbound_at shape).
    const query = sql`
WITH params AS (
    SELECT ${gte}::date AS d_from, (${lt}::date - 1) AS d_to
),
scoped_assets AS (
    SELECT a.id, a.group_id, a.group_name, a.category, a.stock_mode, a.team_id,
           a.total_quantity, a.available_quantity
    FROM assets a
    WHERE a.platform_id = ${ctx.platformId} AND a.company_id = ${ctx.companyId}
      AND a.deleted_at IS NULL
      ${cat}
),
active_bookings AS (
    -- one row per booking leg overlapping the window, with clipped days and the
    -- owning entity id (for a true group-level DISTINCT count). Booking rows are
    -- trusted by EXISTENCE — a row exists IFF the hold is active (release
    -- hard-deletes it), so no parent-status join is needed. The XOR CHECK on
    -- asset_bookings guarantees exactly one of order_id/self_pickup_id is
    -- non-null, so COALESCE yields the single owning entity. Pre-filter casts
    -- ::date so it matches the clip math.
    SELECT
        ab.asset_id,
        ab.id AS booking_id,
        COALESCE(ab.order_id, ab.self_pickup_id) AS entity_id,
        ab.quantity,
        GREATEST(
            0,
            (LEAST(ab.blocked_until::date, p.d_to) - GREATEST(ab.blocked_from::date, p.d_from)) + 1
        ) AS clipped_days
    FROM asset_bookings ab
    CROSS JOIN params p
    WHERE ab.blocked_from::date <= p.d_to
      AND ab.blocked_until::date >= p.d_from
),
booked_by_asset AS (
    -- aggregate bookings to asset grain; exclude zero-overlap legs from the
    -- distinct counts so DISTINCT BOOKINGS>0 ⇔ BOOKED ASSET-DAYS>0.
    SELECT
        asset_id,
        COALESCE(SUM(quantity * clipped_days), 0)::bigint AS booked_asset_days,
        COUNT(DISTINCT booking_id) FILTER (WHERE clipped_days > 0)::int AS distinct_bookings,
        ARRAY_AGG(DISTINCT entity_id) FILTER (WHERE clipped_days > 0) AS entity_ids
    FROM active_bookings
    GROUP BY asset_id
),
outbound_by_asset AS (
    -- all-time OUTBOUND cross-check (range-independent). Reads scan_event_assets
    -- (header+detail), so legacy flat-array scans are invisible — footnoted.
    SELECT
        sea.asset_id,
        COALESCE(SUM(sea.quantity), 0)::bigint AS outbound_scan_qty,
        MAX(se.scanned_at) AS last_outbound
    FROM scan_event_assets sea
    JOIN scan_events se ON sea.scan_event_id = se.id
    WHERE se.scan_type = 'OUTBOUND'
    GROUP BY sea.asset_id
)
SELECT
    sa.group_id,
    MIN(sa.group_name) AS group_name,
    MIN(laf.company_item_code) AS company_item_code,
    MIN(sa.category) AS category,
    MIN(sa.stock_mode) AS stock_mode,
    MIN(t.name) AS team_name,
    COALESCE(SUM(sa.total_quantity), 0)::int AS total_qty,
    COALESCE(SUM(sa.available_quantity), 0)::int AS available_qty,
    ((SELECT d_to FROM params) - (SELECT d_from FROM params) + 1)::int AS range_days,
    COALESCE(SUM(bba.booked_asset_days), 0)::bigint AS booked_asset_days,
    (COALESCE(SUM(sa.total_quantity), 0) * ((SELECT d_to FROM params) - (SELECT d_from FROM params) + 1))::bigint AS available_asset_days,
    COALESCE(SUM(bba.distinct_bookings), 0)::int AS distinct_bookings,
    COUNT(DISTINCT e.entity_id)::int AS distinct_entities,
    COALESCE(SUM(oba.outbound_scan_qty), 0)::bigint AS outbound_scan_qty,
    MAX(oba.last_outbound) AS last_outbound
FROM scoped_assets sa
LEFT JOIN legacy_asset_families laf ON sa.group_id = laf.id
LEFT JOIN teams t ON sa.team_id = t.id
LEFT JOIN booked_by_asset bba ON bba.asset_id = sa.id
LEFT JOIN outbound_by_asset oba ON oba.asset_id = sa.id
LEFT JOIN LATERAL unnest(bba.entity_ids) AS e(entity_id) ON true
GROUP BY sa.group_id
ORDER BY MIN(sa.group_name) ASC NULLS LAST`;

    const raw = ((await db.execute(query)) as any).rows as any[];
    if (raw.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Asset utilization has ${raw.length} groups (cap ${ROW_CAP}). Narrow by date range or category.`
        );

    const nowMs = ctx.now.getTime();
    const rows: UtilRow[] = raw.map((r) => {
        const last = r.last_outbound ? new Date(r.last_outbound) : null;
        return {
            group_id: r.group_id ?? null,
            group_name: r.group_name ?? null,
            company_item_code: r.company_item_code ?? null,
            category: r.category ?? null,
            stock_mode: r.stock_mode ?? null,
            team_name: r.team_name ?? null,
            total_qty: Number(r.total_qty) || 0,
            available_qty: Number(r.available_qty) || 0,
            range_days: Number(r.range_days) || 0,
            booked_asset_days: Number(r.booked_asset_days) || 0,
            available_asset_days: Number(r.available_asset_days) || 0,
            distinct_bookings: Number(r.distinct_bookings) || 0,
            distinct_entities: Number(r.distinct_entities) || 0,
            outbound_scan_qty: Number(r.outbound_scan_qty) || 0,
            last_outbound: last,
            idle_days: last ? Math.floor((nowMs - last.getTime()) / DAY_MS) : null,
        };
    });

    const columns: ReportColumn[] = [
        { header: "GROUP ID", width: 16 },
        { header: "GROUP NAME", width: 34 },
        { header: `${ctx.companyName.toUpperCase()} ITEM CODE`, width: 22 },
        { header: "CATEGORY", width: 16 },
        { header: "STOCK MODE", width: 13 },
        { header: "TEAM", width: 18 },
        { header: "TOTAL QTY", width: 11, align: "right", numFmt: INT_FMT },
        { header: "AVAILABLE QTY", width: 13, align: "right", numFmt: INT_FMT },
        { header: "RANGE DAYS", width: 11, align: "right", numFmt: INT_FMT },
        { header: "BOOKED ASSET-DAYS", width: 16, align: "right", numFmt: INT_FMT },
        { header: "AVAILABLE ASSET-DAYS", width: 17, align: "right", numFmt: INT_FMT },
        { header: "UTILIZATION %", width: 13, align: "right", numFmt: "#,##0.0" },
        { header: "DISTINCT BOOKINGS", width: 15, align: "right", numFmt: INT_FMT },
        { header: "DISTINCT ENTITIES", width: 15, align: "right", numFmt: INT_FMT },
        { header: "OUTBOUND SCAN QTY", width: 15, align: "right", numFmt: INT_FMT },
        { header: "LAST OUTBOUND", width: 14 },
        { header: "IDLE DAYS", width: 11, align: "right", numFmt: INT_FMT },
        { header: "SCAN COVERAGE", width: 16 },
    ];

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Asset Utilization",
        subtitle: fmtRangeLabel(dateFrom, dateTo),
        columns,
        sheetName: "Asset Utilization",
    });
    const sheet = h.sheet;

    // 1-based column indices for the additive totals.
    const TOTAL = 7;
    const BOOKED = 10;
    const AVAIL_DAYS = 11;
    const OUTBOUND = 15;

    const firstDataRow = h.headerRow + 1;
    for (const r of rows) {
        const utilization =
            r.available_asset_days > 0 ? (100 * r.booked_asset_days) / r.available_asset_days : 0;
        let coverage: string;
        if (r.booked_asset_days > 0 && r.outbound_scan_qty === 0) coverage = "BOOKED, NO SCAN";
        else if (r.booked_asset_days === 0 && r.outbound_scan_qty > 0)
            coverage = "SCAN, NO BOOKING";
        else coverage = "OK";

        sheet.addRow([
            r.group_id ?? "",
            r.group_name ?? "",
            r.company_item_code ?? "",
            r.category ?? "",
            r.stock_mode ?? "",
            r.team_name ?? "",
            r.total_qty,
            r.available_qty,
            r.range_days,
            r.booked_asset_days,
            r.available_asset_days,
            Number(utilization.toFixed(1)),
            r.distinct_bookings,
            r.distinct_entities,
            r.outbound_scan_qty,
            r.last_outbound ? fmtDate(r.last_outbound) : "",
            r.idle_days === null ? "N/A" : r.idle_days,
            coverage,
        ]);
    }

    if (rows.length > 0) {
        const lastDataRow = firstDataRow + rows.length - 1;
        const sumTotal = rows.reduce((n, r) => n + r.total_qty, 0);
        const sumBooked = rows.reduce((n, r) => n + r.booked_asset_days, 0);
        const sumAvailDays = rows.reduce((n, r) => n + r.available_asset_days, 0);
        const sumOutbound = rows.reduce((n, r) => n + r.outbound_scan_qty, 0);

        const sub = addSubtotalRow(sheet, {
            label: `TOTAL — ${ctx.companyName}`,
            labelCol: 6,
            sums: [
                { col: TOTAL, from: firstDataRow, to: lastDataRow, cached: sumTotal },
                { col: BOOKED, from: firstDataRow, to: lastDataRow, cached: sumBooked },
                { col: AVAIL_DAYS, from: firstDataRow, to: lastDataRow, cached: sumAvailDays },
                { col: OUTBOUND, from: firstDataRow, to: lastDataRow, cached: sumOutbound },
            ],
        });
        // Footer UTILIZATION % = 100 × ΣBOOKED / ΣAVAILABLE (computed once, fleet-wide).
        if (sumAvailDays > 0) {
            sub.getCell(12).value = Number(((100 * sumBooked) / sumAvailDays).toFixed(1));
        }

        addGrandTotalRow(sheet, {
            label: `GRAND TOTAL — ${ctx.companyName}`,
            labelCol: 6,
            sums: [
                { col: TOTAL, subtotalRows: [sub.number], cached: sumTotal },
                { col: BOOKED, subtotalRows: [sub.number], cached: sumBooked },
                { col: AVAIL_DAYS, subtotalRows: [sub.number], cached: sumAvailDays },
                { col: OUTBOUND, subtotalRows: [sub.number], cached: sumOutbound },
            ],
        });
    }

    // Footnotes — surface the load-bearing caveats on the sheet itself.
    sheet.addRow([]);
    const footnotes = [
        "Self-bookings (internal, not part of asset_bookings) are EXCLUDED — booked asset-days UNDER-count physical holds.",
        "UTILIZATION % uses theoretical capacity (TOTAL QTY × RANGE DAYS) and does NOT subtract refurb/maintenance downtime; it can exceed 100%.",
        "OUTBOUND SCAN QTY / LAST OUTBOUND read scan_event_assets only (all-time, range-independent); pre-header-table legacy scans are invisible.",
        "SCAN COVERAGE flags booking-vs-physical drift; 'SCAN, NO BOOKING' can be legitimate (self-bookings / ad-hoc stock movements).",
    ];
    for (const note of footnotes) {
        const fn = sheet.addRow([note]);
        fn.getCell(1).font = { italic: true, color: { argb: "FF6B6B6B" } };
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const assetUtilizationReport: ReportDefinition = {
    key: "asset-utilization",
    label: "Asset Utilization",
    description:
        "Per-asset-group (family) utilization over a date window: booked asset-days vs theoretical capacity, with utilization %, distinct booking/entity counts, and an outbound-scan cross-check to surface booking-vs-physical drift. Defaults to a trailing 365-day window. No money columns.",
    section: "INVENTORY",
    audience: "ADMIN_CLIENT",
    permissions: ["assets:read"],
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
