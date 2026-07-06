/**
 * Orders Export — one row per order line item (orders ⋈ order_items) for a
 * company, with order-level header context, per-item qty/volume/weight, the
 * curated company item code + category, and order financial totals. The
 * canonical XLSX replacement for the flat /export/orders CSV
 * (export.services.ts:exportOrdersService).
 *
 * LEAK-RISK report. The sell columns (subtotal ex-VAT, VAT %, VAT amount, final
 * total inc-VAT) are always allowed. The three cost/margin columns — ORDER
 * MARGIN %, ORDER BUY TOTAL, ORDER BASE OPS (BUY) — are gated on ctx.canSeeMargin
 * and are NEVER built into the client/sell variant. (Spec appendix "Orders
 * Export" → "Safety leak columns".)
 *
 * MONEY FAN-OUT FIX (spec required fix): a single order's pricing row fans out
 * across all its order_items rows. Order-level money is written ONCE per order
 * (on the order's FIRST item row only, blank on the rest) and is NEVER summed
 * into a grand-total via a column SUM. The QUANTITY grand total is the only
 * additive column footer; the order-level money grand total is computed in JS
 * over a per-order-deduplicated Map (one projected summary per order.id).
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { PricingService } from "../../../services/pricing.service";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import { groupByCompany } from "../shared/group-by-company";
import type ExcelJS from "exceljs";
import {
    addGrandTotalRow,
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

const ROW_CAP = 10000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** All order statuses (mirror orderStatusEnum in schema.ts), rendered readably. */
const ORDER_STATUS_VALUES = [
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

/** ENUM_VALUE → "Title Case" label (e.g. READY_FOR_DELIVERY → "Ready For Delivery"). */
const toTitleCase = (s: string): string =>
    s
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

const ORDER_STATUS_OPTIONS = ORDER_STATUS_VALUES.map((v) => ({
    value: v,
    label: toTitleCase(v),
}));

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        // Optional → when omitted, the report runs across ALL companies on the
        // platform (the controller sets ctx.allCompanies). Mirrors accounts-reconciliation.
        company_id: z.string().uuid().optional(),
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
        status: z.union([z.string(), z.array(z.string())]).optional(),
        group_id: z.string().uuid().optional(),
        team_id: z.string().uuid().optional(),
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

/** Default scope: every real order, excluding only unsubmitted DRAFT carts.
 *  An explicit :status list overrides this with an exact-match IN list. */
function statusFilter(statuses: string[]): SQL {
    if (statuses.length)
        return sql` AND o.order_status IN (${sql.join(
            statuses.map((s) => sql`${s}`),
            sql`, `
        )})`;
    return sql` AND o.order_status <> 'DRAFT'`;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const statuses = toArr(params.status);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);

    const groupFilter = params.group_id ? sql` AND a.group_id = ${params.group_id}` : sql``;
    const teamFilter = params.team_id ? sql` AND a.team_id = ${params.team_id}` : sql``;

    // All-companies mode: drop the per-company filter and lean on platform_id scoping.
    // Single-company mode: bind to ctx.companyId.
    const allCompanies = !!ctx.allCompanies;
    const companyScope = allCompanies ? sql`` : sql` AND o.company = ${ctx.companyId}`;

    // INNER join orders⋈order_items at item grain; order-level pricing carried
    // alongside (identical across the order's item rows — de-duped in JS below).
    // scan_events FK for order is the PG-quoted column "order".
    const query = sql`
SELECT
    o.id AS order_uuid,
    o.order_id AS order_ref,
    o.job_number,
    o.po_number,
    o.order_status,
    o.financial_status,
    co.name AS company_name,
    b.name AS brand_name,
    o.contact_name,
    o.contact_email,
    o.event_start_date,
    o.event_end_date,
    o.venue_name,
    ci.name AS venue_city,
    o.is_permanent_placement,
    ( SELECT MAX(se.scanned_at) FROM scan_events se
      WHERE se."order" = o.id AND se.scan_type = 'OUTBOUND' ) AS issued_at,
    o.created_at,
    (o.calculated_totals->>'volume') AS order_total_volume,
    (o.calculated_totals->>'weight') AS order_total_weight,
    p.breakdown_lines,
    p.margin_percent,
    p.vat_percent,
    p.calculated_at,
    af.company_item_code AS company_item_code,
    a.category AS item_category,
    t.name AS team_name,
    oi.asset_name AS item_asset_name,
    COALESCE(af.name, a.group_name, oi.asset_name) AS item_description,
    oi.quantity AS item_quantity,
    oi.total_volume AS item_volume,
    oi.total_weight AS item_weight,
    oi.requires_maintenance,
    oi.condition_notes AS item_condition_notes,
    oi.from_collection_name
FROM orders o
JOIN order_items oi ON oi."order" = o.id
LEFT JOIN companies co ON o.company = co.id
LEFT JOIN brands b ON o.brand = b.id
LEFT JOIN cities ci ON o.venue_city_id = ci.id
LEFT JOIN prices p ON o.order_pricing_id = p.id
LEFT JOIN assets a ON oi.asset = a.id
LEFT JOIN legacy_asset_families af ON a.group_id = af.id
LEFT JOIN teams t ON a.team_id = t.id
WHERE o.platform_id = ${ctx.platformId}
  ${companyScope}
  AND o.deleted_at IS NULL
  ${statusFilter(statuses)}
  ${cat}
  ${groupFilter}
  ${teamFilter}
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}
ORDER BY co.name ASC, o.created_at ASC, o.order_id ASC, oi.id ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Orders export has ${rows.length} item rows (cap ${ROW_CAP}). Narrow by date range${
                allCompanies ? " (strongly recommended for all-companies runs)" : ""
            }, status, category, group, or team.`
        );

    const showMargin = ctx.canSeeMargin && !ctx.isClientMount;

    // In all-companies mode the company_item_code column is company-agnostic —
    // avoid rendering 'ALL COMPANIES ITEM CODE'. Single-company keeps the branded label.
    const itemCodeHeader = allCompanies
        ? "COMPANY ITEM CODE"
        : `${ctx.companyName.toUpperCase()} ITEM CODE`;

    const columns: ReportColumn[] = [
        { header: "ORDER REFERENCE", width: 20 },
        { header: "JOB NUMBER", width: 16 },
        { header: "PO NUMBER", width: 16 },
        { header: "ORDER STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
        { header: "COMPANY", width: 22 },
        { header: "BRAND", width: 18 },
        { header: "CONTACT NAME", width: 20 },
        { header: "CONTACT EMAIL", width: 26 },
        { header: "EVENT START", width: 13 },
        { header: "EVENT END", width: 13 },
        { header: "VENUE NAME", width: 28 },
        { header: "VENUE CITY", width: 14 },
        { header: "PERMANENT PLACEMENT", width: 12 },
        { header: "ISSUED AT", width: 13 },
        { header: "ORDER CREATED AT", width: 14 },
        { header: itemCodeHeader, width: 22 },
        { header: "ITEM DESCRIPTION", width: 44 },
        { header: "ITEM CATEGORY", width: 18 },
        { header: "TEAM", width: 18 },
        { header: "QUANTITY", width: 11, align: "right", numFmt: INT_FMT },
        { header: "ITEM VOLUME (M3)", width: 14, align: "right", numFmt: MONEY_FMT },
        { header: "ITEM WEIGHT (KG)", width: 14, align: "right", numFmt: MONEY_FMT },
        { header: "REQUIRES MAINTENANCE", width: 12 },
        { header: "ITEM CONDITION NOTES", width: 30 },
        { header: "FROM COLLECTION", width: 22 },
        { header: "ORDER TOTAL VOLUME (M3)", width: 16, align: "right", numFmt: MONEY_FMT },
        { header: "ORDER TOTAL WEIGHT (KG)", width: 16, align: "right", numFmt: MONEY_FMT },
        { header: "ORDER SUBTOTAL (EX VAT)", width: 18, align: "right", numFmt: MONEY_FMT },
        { header: "ORDER VAT %", width: 11, align: "right", numFmt: MONEY_FMT },
        { header: "ORDER VAT AMOUNT", width: 16, align: "right", numFmt: MONEY_FMT },
        { header: "ORDER FINAL TOTAL (INC VAT)", width: 18, align: "right", numFmt: MONEY_FMT },
    ];
    // QUANTITY column index (1-based) — the ONLY additive footer column.
    const QTY = 21;
    const LABEL = 17; // ITEM CODE column — host for subtotal/grand-total labels
    if (showMargin) {
        columns.push(
            { header: "ORDER MARGIN %", width: 12, align: "right", numFmt: MONEY_FMT },
            { header: "ORDER BUY TOTAL", width: 16, align: "right", numFmt: MONEY_FMT }
        );
    }

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Orders Export",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Orders",
    });
    const sheet = h.sheet;

    // Per-order de-duped money — one projected summary per order.id. Drives the
    // first-item-row-only money cells AND the JS grand total (NEVER a column SUM).
    type OrderMoney = {
        subtotal: number;
        vatPercent: number;
        vatAmount: number;
        finalTotal: number;
        marginPercent: number;
        buyTotal: number;
        company: string; // used to bucket into per-company subtotals
    };

    // Helper: sum de-duped order money from a Map, skipping already-seen UUIDs.
    type MoneySums = {
        subtotal: number;
        vatAmount: number;
        finalTotal: number;
        buyTotal: number;
        qty: number;
        orderCount: number;
    };
    const sumMoneyMap = (map: Map<string, OrderMoney>, qtyMap: Map<string, number>): MoneySums => {
        let subtotal = 0,
            vatAmount = 0,
            finalTotal = 0,
            buyTotal = 0,
            qty = 0;
        for (const [uuid, m] of map) {
            subtotal += m.subtotal;
            vatAmount += m.vatAmount;
            finalTotal += m.finalTotal;
            buyTotal += m.buyTotal;
            qty += qtyMap.get(uuid) ?? 0;
        }
        return { subtotal, vatAmount, finalTotal, buyTotal, qty, orderCount: map.size };
    };

    // Write a cached totals row (no live SUM formulas) — used in all-companies mode
    // where interleaved subtotal rows corrupt a single SUM range, and also in
    // single-company mode for the money columns (money is de-duped at order level,
    // not per item, so column SUMs would multiply by item count).
    const writeCachedTotals = (label: string, sums: MoneySums, fill: ExcelJS.Fill, big = false) => {
        const row = sheet.addRow([]);
        row.getCell(LABEL).value = label;
        row.font = big ? { bold: true, size: 12 } : { bold: true };
        if (big) row.height = 20;
        row.eachCell({ includeEmpty: true }, (cell) => (cell.fill = fill));
        const put = (col: number, val: number) => {
            row.getCell(col).value = roundMoney(val);
            row.getCell(col).numFmt = MONEY_FMT;
        };
        row.getCell(QTY).value = sums.qty;
        row.getCell(QTY).numFmt = INT_FMT;
        put(29, sums.subtotal); // ORDER SUBTOTAL (EX VAT)
        put(31, sums.vatAmount); // ORDER VAT AMOUNT
        put(32, sums.finalTotal); // ORDER FINAL TOTAL (INC VAT)
        if (showMargin) {
            put(34, sums.buyTotal); // ORDER BUY TOTAL
        }
        return row;
    };

    // Global tracking.
    const globalMoneyByOrder = new Map<string, OrderMoney>();
    const qtyByOrder = new Map<string, number>();
    const seenFirstRow = new Set<string>();

    const writeDataRow = (r: any) => {
        const orderUuid = String(r.order_uuid);
        const isFirstRowOfOrder = !seenFirstRow.has(orderUuid);

        // Project + cache the order money exactly once per order.
        if (!globalMoneyByOrder.has(orderUuid)) {
            const sellSummary = PricingService.projectSummaryForRole(r as any, "CLIENT") as any;
            const subtotal = parseNum(sellSummary?.subtotal);
            const vatPercent = parseNum(sellSummary?.vat_percent);
            const vatAmount = parseNum(sellSummary?.vat_amount);
            const finalTotal = parseNum(sellSummary?.final_total);

            let marginPercent = 0;
            let buyTotal = 0;
            if (showMargin) {
                const adminDetail = PricingService.projectByRole(r as any, "ADMIN") as any;
                buyTotal = parseNum(adminDetail?.totals?.buy_total);
                const marginAmount = parseNum(adminDetail?.totals?.margin_amount);
                // BLENDED (realized) margin % = margin_amount / buy_total * 100 — the
                // entity-wide margin_percent no longer equals the realized margin once
                // per-line sell overrides exist. Guard buy_total == 0 (un-priced order).
                marginPercent = buyTotal > 0 ? (marginAmount / buyTotal) * 100 : 0;
            }
            globalMoneyByOrder.set(orderUuid, {
                subtotal,
                vatPercent,
                vatAmount,
                finalTotal,
                marginPercent,
                buyTotal,
                company: r.company_name ?? "",
            });
            qtyByOrder.set(orderUuid, 0);
        }
        const money = globalMoneyByOrder.get(orderUuid)!;

        const qty = Number(r.item_quantity) || 0;
        qtyByOrder.set(orderUuid, (qtyByOrder.get(orderUuid) ?? 0) + qty);

        const cells: (string | number)[] = [
            r.order_ref ?? "",
            r.job_number ?? "",
            r.po_number ?? "",
            r.order_status ?? "",
            r.financial_status ?? "",
            r.company_name ?? "",
            r.brand_name ?? "",
            r.contact_name ?? "",
            r.contact_email ?? "",
            fmtDate(r.event_start_date),
            fmtDate(r.event_end_date),
            r.venue_name ?? "",
            r.venue_city ?? "",
            r.is_permanent_placement ? "YES" : "NO",
            r.issued_at ? fmtDate(r.issued_at) : "",
            fmtDate(r.created_at),
            r.company_item_code ?? "",
            r.item_description ?? "",
            r.item_category ?? "",
            r.team_name ?? "",
            qty,
            parseNum(r.item_volume),
            parseNum(r.item_weight),
            r.requires_maintenance ? "YES" : "NO",
            r.item_condition_notes ?? "",
            r.from_collection_name ?? "",
            // Order-level money — written ONCE per order (first item row only).
            isFirstRowOfOrder ? parseNum(r.order_total_volume) : "",
            isFirstRowOfOrder ? parseNum(r.order_total_weight) : "",
            isFirstRowOfOrder ? roundMoney(money.subtotal) : "",
            isFirstRowOfOrder ? roundMoney(money.vatPercent) : "",
            isFirstRowOfOrder ? roundMoney(money.vatAmount) : "",
            isFirstRowOfOrder ? roundMoney(money.finalTotal) : "",
        ];
        if (showMargin) {
            cells.push(
                isFirstRowOfOrder ? roundMoney(money.marginPercent) : "",
                isFirstRowOfOrder ? roundMoney(money.buyTotal) : ""
            );
        }

        sheet.addRow(cells);
        seenFirstRow.add(orderUuid);
    };

    if (allCompanies) {
        for (const g of groupByCompany(rows, (r: any) => r.company_name as string | null)) {
            // Track this company's orders only (for per-company subtotal).
            const companyOrdersBefore = new Set(globalMoneyByOrder.keys());
            for (const r of g.rows) writeDataRow(r);
            // Collect only the orders added by this company's rows.
            const companyMoneyMap = new Map<string, OrderMoney>();
            for (const [uuid, m] of globalMoneyByOrder) {
                if (!companyOrdersBefore.has(uuid)) companyMoneyMap.set(uuid, m);
            }
            const subs = sumMoneyMap(companyMoneyMap, qtyByOrder);
            writeCachedTotals(
                `Subtotal — ${g.company} (${subs.orderCount} orders)`,
                subs,
                STYLE.SUBTOTAL_FILL
            );
            sheet.addRow([]); // spacer between companies
        }
        if (rows.length > 0) {
            const grandSums = sumMoneyMap(globalMoneyByOrder, qtyByOrder);
            writeCachedTotals(
                `GRAND TOTAL — ${ctx.companyName} (${grandSums.orderCount} orders)`,
                grandSums,
                STYLE.GRAND_FILL,
                true
            );
        }
    } else {
        for (const r of rows) writeDataRow(r);

        // Grand-total footer: QUANTITY gets a live column SUM (genuinely per-line
        // additive). Order-level money is summed from the de-duped Map as cached
        // literals (never a fan-out SUM — that would multiply by item count).
        if (rows.length > 0) {
            const firstDataRow = h.headerRow + 1;
            const lastDataRow = h.headerRow + rows.length;
            const grandSums = sumMoneyMap(globalMoneyByOrder, qtyByOrder);

            const grand = addGrandTotalRow(sheet, {
                label: `GRAND TOTAL — ${ctx.companyName} (${grandSums.orderCount} orders)`,
                labelCol: LABEL,
                sums: [
                    {
                        col: QTY,
                        subtotalRows: [],
                        cached: 0, // overwritten below with the real QTY column SUM
                    },
                ],
            });
            // QUANTITY: a real column SUM over the data rows (genuinely per-line additive).
            const qtyL = "U"; // colLetter(QTY-1) = colLetter(20) = "U"
            grand.getCell(QTY).value = {
                formula: `SUM(${qtyL}${firstDataRow}:${qtyL}${lastDataRow})`,
                result: grandSums.qty,
            };
            // Order-level money: de-duped JS totals as literals (NOT column SUMs).
            grand.getCell(29).value = roundMoney(grandSums.subtotal); // ORDER SUBTOTAL (EX VAT)
            grand.getCell(31).value = roundMoney(grandSums.vatAmount); // ORDER VAT AMOUNT
            grand.getCell(32).value = roundMoney(grandSums.finalTotal); // ORDER FINAL TOTAL (INC VAT)
            if (showMargin) {
                grand.getCell(34).value = roundMoney(grandSums.buyTotal); // ORDER BUY TOTAL
            }
        }
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const ordersReport: ReportDefinition = {
    key: "orders",
    label: "Orders Export",
    description:
        "One row per order line item with order-level header context, per-item quantity/volume/weight, the curated company item code + category, and order financial totals. Order-level money appears once per order. Cost/margin columns are admin-only. Leave Company blank to run across ALL companies on the platform (grouped with per-company subtotals) — use a date range for all-companies runs.",
    section: "OPERATIONS",
    audience: "ADMIN_CLIENT",
    permissions: ["orders:export", "orders:read"],
    filters: [
        // Optional — leave blank to run across ALL companies on the platform.
        { key: "company_id", label: "Company", type: "company", required: false },
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
            label: "Order Status",
            type: "status",
            required: false,
            options: ORDER_STATUS_OPTIONS,
        },
        { key: "group_id", label: "Group", type: "group", required: false, scope: "item" },
        { key: "team_id", label: "Team", type: "team", required: false, scope: "item" },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint:
            "narrow by date range (strongly recommended for all-companies runs), status, category, group, or team",
    },
    run,
};
