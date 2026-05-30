/**
 * Current Stock / State of Assets — per-asset (with per-family subtotals)
 * snapshot of every live asset's stock state for one company: TOTAL vs
 * AVAILABLE (stored, all-window) vs OUT (active bookings overlapping the as-of
 * instant) vs derived UNAVAILABLE (clamped residual). Absorbs the two legacy
 * CSVs (exportStockReportService + exportAssetsOutService) into one reconcilable
 * XLSX.
 *
 * No money columns → client-safe; ADMIN_CLIENT. This is a SNAPSHOT report (no
 * native time axis) → subtitle is asOfLabel(ctx.now); the OUT overlap window is
 * the as-of day (start/end of the Dubai day) per the numbers-skeptic fix to
 * bound the comparison to DATE grain (blocked_from/until are timestamp(mode:date)).
 *
 * Reconciliation notes baked into the sheet as footnotes:
 *  - TOTAL = AVAILABLE + OUT + UNAVAILABLE per asset (true by construction —
 *    UNAVAILABLE is the clamped residual, not an independent measurement).
 *  - AVAILABLE (stored, all-window, booking-lifecycle owned, includes
 *    self-bookings + future/past bookings) and OUT (as-of-window only) are
 *    DISTINCT measurements; AVAILABLE + OUT is NOT a clean (TOTAL − refurb).
 *  - Orders book at SUBMIT, so OUT here runs higher than the legacy assets-out
 *    report (which only counted READY_FOR_DELIVERY..RETURN_IN_TRANSIT).
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import { ACTIVE_PARENT_STATUSES_FOR_BOOKINGS } from "../../../shared/availability/availability.core";
import {
    addGrandTotalRow,
    addSubtotalRow,
    asOfLabel,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    INT_FMT,
    ReportColumn,
} from "../../../utils/report-workbook";

const ROW_CAP = 5000;

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        // date_from/date_to are accepted for filter-shape parity with the other
        // INVENTORY reports but a state-of-assets snapshot has no native time
        // axis — they are intentionally NOT applied (the OUT window is the
        // as-of day). Documented on the sheet footnote.
        date_from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        date_to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
        group_id: z.string().uuid().optional(),
        status: z.string().optional(),
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

/** Bound the active-parent status lists from the shared SSOT (gotcha #44). */
const ORDER_STATUSES = sql.join(
    ACTIVE_PARENT_STATUSES_FOR_BOOKINGS.ORDER.map((s) => sql`${s}`),
    sql`, `
);
const SP_STATUSES = sql.join(
    ACTIVE_PARENT_STATUSES_FOR_BOOKINGS.SELF_PICKUP.map((s) => sql`${s}`),
    sql`, `
);

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const cat = categoryFilter(inc, exc);

    // Snapshot as-of window: start/end of the as-of (Dubai) calendar day so an
    // asset doesn't flicker out of OUT on a same-day boundary. blocked_from/
    // until are timestamp(mode:date) — we cast ::date and compare to the day.
    const asOfDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(ctx.now); // YYYY-MM-DD

    const groupFilter = params.group_id ? sql` AND a.group_id = ${params.group_id}` : sql``;
    const statusFilter = params.status
        ? sql` AND a.status = ${params.status}::asset_status`
        : sql``;

    const query = sql`
WITH active_out AS (
    -- OUT QTY: active bookings overlapping the as-of day. Polymorphic XOR on
    -- asset_bookings (CHECK enforces exactly one parent FK) → no double-count.
    -- Pre-aggregated to asset grain so the 1:1 LEFT JOIN can't fan out the
    -- per-asset row.
    SELECT ab.asset_id, COALESCE(SUM(ab.quantity), 0)::int AS out_qty
    FROM asset_bookings ab
    LEFT JOIN orders o ON ab.order_id = o.id
    LEFT JOIN self_pickups sp ON ab.self_pickup_id = sp.id
    WHERE ab.blocked_from::date <= ${asOfDay}::date
      AND ab.blocked_until::date >= ${asOfDay}::date
      AND (
        (ab.order_id IS NOT NULL AND o.order_status IN (${ORDER_STATUSES}))
        OR
        (ab.self_pickup_id IS NOT NULL AND sp.self_pickup_status IN (${SP_STATUSES}))
      )
    GROUP BY ab.asset_id
),
all_windows_out AS (
    -- Independent drift-check aggregate (reconciliation identity #4): SUM of
    -- ALL active bookings across ALL windows (status-only, both polymorphic
    -- arms). Compare to (TOTAL − stored AVAILABLE) to surface booking-engine
    -- drift. NOT assumed equal — divergence is a signal, not an error.
    SELECT ab.asset_id, COALESCE(SUM(ab.quantity), 0)::int AS all_out_qty
    FROM asset_bookings ab
    LEFT JOIN orders o ON ab.order_id = o.id
    LEFT JOIN self_pickups sp ON ab.self_pickup_id = sp.id
    WHERE (
        (ab.order_id IS NOT NULL AND o.order_status IN (${ORDER_STATUSES}))
        OR
        (ab.self_pickup_id IS NOT NULL AND sp.self_pickup_status IN (${SP_STATUSES}))
      )
    GROUP BY ab.asset_id
)
SELECT
    a.group_id,
    laf.company_item_code AS company_item_code,
    a.group_name,
    a.id AS asset_id,
    a.name AS asset_name,
    a.qr_code,
    a.category,
    a.stock_mode,
    a.condition,
    a.status,
    a.total_quantity AS total_qty,
    a.available_quantity AS available_qty,
    COALESCE(ao.out_qty, 0) AS out_qty,
    -- UNAVAILABLE is the clamped residual (DERIVED, not stored). For POOLED it
    -- is a forced residual (total − available − out), NOT an independent
    -- measurement of refurb/maintenance units.
    GREATEST(0, a.total_quantity - a.available_quantity - COALESCE(ao.out_qty, 0)) AS unavailable_qty,
    a.refurb_days_estimate,
    a.low_stock_threshold,
    COALESCE(awo.all_out_qty, 0) AS all_windows_booked,
    w.name AS warehouse_name,
    z.name AS zone_name,
    b.name AS brand_name,
    t.name AS team_name,
    a.last_scanned_at
FROM assets a
LEFT JOIN legacy_asset_families laf ON a.group_id = laf.id
LEFT JOIN warehouses w ON a.warehouse_id = w.id
LEFT JOIN zones z ON a.zone_id = z.id
LEFT JOIN brands b ON a.brand_id = b.id
LEFT JOIN teams t ON a.team_id = t.id
LEFT JOIN active_out ao ON ao.asset_id = a.id
LEFT JOIN all_windows_out awo ON awo.asset_id = a.id
WHERE a.platform_id = ${ctx.platformId} AND a.company_id = ${ctx.companyId} AND a.deleted_at IS NULL
  ${cat}
  ${groupFilter}
  ${statusFilter}
ORDER BY a.group_name ASC NULLS LAST, a.name ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Current Stock has ${rows.length} asset rows (cap ${ROW_CAP}). Narrow by group, status, or category.`
        );

    const columns: ReportColumn[] = [
        { header: "GROUP ID", width: 38 },
        { header: `${ctx.companyName.toUpperCase()} ITEM CODE`, width: 22 },
        { header: "GROUP NAME", width: 30 },
        { header: "ASSET ID", width: 38 },
        { header: "ASSET NAME", width: 32 },
        { header: "QR CODE", width: 18 },
        { header: "CATEGORY", width: 16 },
        { header: "STOCK MODE", width: 13 },
        { header: "CONDITION", width: 12 },
        { header: "STATUS", width: 13 },
        { header: "TOTAL QTY", width: 11, align: "right", numFmt: INT_FMT },
        { header: "AVAILABLE QTY", width: 14, align: "right", numFmt: INT_FMT },
        { header: "OUT QTY", width: 11, align: "right", numFmt: INT_FMT },
        { header: "UNAVAILABLE QTY", width: 15, align: "right", numFmt: INT_FMT },
        { header: "BOOKED (ALL WINDOWS)", width: 19, align: "right", numFmt: INT_FMT },
        { header: "REFURB DAYS EST", width: 15, align: "right", numFmt: INT_FMT },
        { header: "LOW STOCK THRESHOLD", width: 18, align: "right", numFmt: INT_FMT },
        { header: "WAREHOUSE", width: 20 },
        { header: "ZONE", width: 16 },
        { header: "BRAND", width: 18 },
        { header: "TEAM", width: 18 },
        { header: "LAST SCANNED AT", width: 16 },
    ];

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Current Stock / State of Assets",
        subtitle: asOfLabel(ctx.now),
        columns,
        sheetName: "Current Stock",
    });
    const sheet = h.sheet;

    // 1-based column indices for the summed quantity columns + the subtotal label.
    const TOTAL = 11;
    const AVAIL = 12;
    const OUT = 13;
    const UNAVAIL = 14;
    const ALLWIN = 15;
    const LABEL = 3; // GROUP NAME column carries the "Subtotal — <group>" label

    // Group by group_id (NULL → its own "(no group)" bucket of orphans/raw assets).
    const groups = new Map<string, { name: string; rows: any[] }>();
    for (const r of rows) {
        const key = r.group_id ? String(r.group_id) : "__nogroup__";
        if (!groups.has(key)) groups.set(key, { name: r.group_name ?? "(no group)", rows: [] });
        groups.get(key)!.rows.push(r);
    }

    const sum = (gr: any[], field: string) => gr.reduce((n, r) => n + (Number(r[field]) || 0), 0);

    const subRows: number[] = [];
    for (const { name, rows: gr } of groups.values()) {
        let first = 0;
        let last = 0;
        for (const r of gr) {
            const row = sheet.addRow([
                r.group_id ?? "",
                r.company_item_code ?? "",
                r.group_name ?? "",
                r.asset_id,
                r.asset_name ?? "",
                r.qr_code ?? "",
                r.category ?? "",
                r.stock_mode ?? "",
                r.condition ?? "",
                r.status ?? "",
                Number(r.total_qty) || 0,
                Number(r.available_qty) || 0,
                Number(r.out_qty) || 0,
                Number(r.unavailable_qty) || 0,
                Number(r.all_windows_booked) || 0,
                r.refurb_days_estimate == null ? "" : Number(r.refurb_days_estimate),
                r.low_stock_threshold == null ? "" : Number(r.low_stock_threshold),
                r.warehouse_name ?? "",
                r.zone_name ?? "",
                r.brand_name ?? "",
                r.team_name ?? "",
                fmtDate(r.last_scanned_at),
            ]);
            if (!first) first = row.number;
            last = row.number;
        }
        const sub = addSubtotalRow(sheet, {
            label: `Subtotal — ${name}`,
            labelCol: LABEL,
            sums: [
                { col: TOTAL, from: first, to: last, cached: sum(gr, "total_qty") },
                { col: AVAIL, from: first, to: last, cached: sum(gr, "available_qty") },
                { col: OUT, from: first, to: last, cached: sum(gr, "out_qty") },
                { col: UNAVAIL, from: first, to: last, cached: sum(gr, "unavailable_qty") },
                { col: ALLWIN, from: first, to: last, cached: sum(gr, "all_windows_booked") },
            ],
        });
        subRows.push(sub.number);
        sheet.addRow([]);
    }

    addGrandTotalRow(sheet, {
        label: `GRAND TOTAL — ${ctx.companyName}`,
        labelCol: LABEL,
        sums: [
            { col: TOTAL, subtotalRows: subRows, cached: sum(rows, "total_qty") },
            { col: AVAIL, subtotalRows: subRows, cached: sum(rows, "available_qty") },
            { col: OUT, subtotalRows: subRows, cached: sum(rows, "out_qty") },
            { col: UNAVAIL, subtotalRows: subRows, cached: sum(rows, "unavailable_qty") },
            { col: ALLWIN, subtotalRows: subRows, cached: sum(rows, "all_windows_booked") },
        ],
    });

    // On-sheet footnotes — the reconciliation caveats the spec mandates surface
    // directly on the workbook (never as runtime asserts).
    if (rows.length > 0) {
        sheet.addRow([]);
        const notes = [
            "TOTAL QTY = AVAILABLE QTY + OUT QTY + UNAVAILABLE QTY per asset — true by construction; UNAVAILABLE is the clamped residual, not an independent count of refurb/maintenance units.",
            "AVAILABLE QTY is the stored booking-lifecycle counter and reflects ALL bookings across ALL time windows PLUS self-bookings; OUT QTY counts only bookings overlapping the as-of instant. The two are DISTINCT measurements — AVAILABLE + OUT is NOT a clean (TOTAL − refurb).",
            "BOOKED (ALL WINDOWS) is a drift-check aid: compare it to (TOTAL QTY − AVAILABLE QTY). A large divergence (allowing for self-bookings, which are not in asset_bookings) indicates booking-engine drift worth investigating.",
            "Orders book at SUBMIT (not at CONFIRMED), so OUT QTY here runs higher than the legacy assets-out report, which only counted READY_FOR_DELIVERY..RETURN_IN_TRANSIT.",
            "Snapshot only: this report has no native time axis. The OUT overlap window is the as-of day; date_from/date_to filters are not applied.",
        ];
        for (const text of notes) {
            const nr = sheet.addRow([text]);
            nr.getCell(1).font = { italic: true, size: 9, color: { argb: "FF6B6B6B" } };
        }
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const currentStockReport: ReportDefinition = {
    key: "current-stock",
    label: "Current Stock / State of Assets",
    description:
        "Per-asset snapshot (with per-family subtotals) of every live asset's stock state for one company — total vs available (all-window) vs currently-out (active bookings overlapping now) vs derived unavailable. Absorbs the legacy stock-report + assets-out CSVs.",
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
        { key: "group_id", label: "Group", type: "group", required: false },
        { key: "status", label: "Status", type: "status", required: false },
    ],
    paramsSchema,
    rowCap: { max: ROW_CAP, dimension: "rows", narrowHint: "narrow by group, status, or category" },
    run,
};
