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
} from "../../../utils/report-workbook";

const ROW_CAP = 10000;
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
    p.margin_is_override,
    p.margin_override_reason,
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
WHERE o.platform_id = ${ctx.platformId} AND o.company = ${ctx.companyId}
  AND o.deleted_at IS NULL
  ${statusFilter(statuses)}
  ${cat}
  ${groupFilter}
  ${teamFilter}
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}
ORDER BY o.created_at ASC, o.order_id ASC, oi.id ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Orders export has ${rows.length} item rows (cap ${ROW_CAP}). Narrow by date range, status, category, group, or team.`
        );

    const showMargin = ctx.canSeeMargin && !ctx.isClientMount;

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
        { header: `${ctx.companyName.toUpperCase()} ITEM CODE`, width: 22 },
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
            { header: "ORDER BUY TOTAL", width: 16, align: "right", numFmt: MONEY_FMT },
            { header: "ORDER BASE OPS (BUY)", width: 16, align: "right", numFmt: MONEY_FMT }
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
        baseOpsBuy: number;
    };
    const moneyByOrder = new Map<string, OrderMoney>();
    const seenFirstRow = new Set<string>();

    let qtyGrandTotal = 0;

    for (const r of rows) {
        const orderUuid = String(r.order_uuid);
        const isFirstRowOfOrder = !seenFirstRow.has(orderUuid);

        // Project + cache the order money exactly once per order.
        if (!moneyByOrder.has(orderUuid)) {
            const sellSummary = PricingService.projectSummaryForRole(r as any, "CLIENT") as any;
            const subtotal = parseNum(sellSummary?.subtotal);
            const vatPercent = parseNum(sellSummary?.vat_percent);
            const vatAmount = parseNum(sellSummary?.vat_amount);
            const finalTotal = parseNum(sellSummary?.final_total);

            let marginPercent = 0;
            let buyTotal = 0;
            let baseOpsBuy = 0;
            if (showMargin) {
                const adminDetail = PricingService.projectByRole(r as any, "ADMIN") as any;
                marginPercent = parseNum(adminDetail?.margin?.percent);
                buyTotal = parseNum(adminDetail?.totals?.buy_total);
                // base_ops_total on the ADMIN projection is the BUY base-ops figure.
                baseOpsBuy = parseNum(adminDetail?.base_ops_total);
            }
            moneyByOrder.set(orderUuid, {
                subtotal,
                vatPercent,
                vatAmount,
                finalTotal,
                marginPercent,
                buyTotal,
                baseOpsBuy,
            });
        }
        const money = moneyByOrder.get(orderUuid)!;

        const qty = Number(r.item_quantity) || 0;
        qtyGrandTotal += qty;

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
                isFirstRowOfOrder ? roundMoney(money.buyTotal) : "",
                isFirstRowOfOrder ? roundMoney(money.baseOpsBuy) : ""
            );
        }

        sheet.addRow(cells);
        seenFirstRow.add(orderUuid);
    }

    // Grand-total footer: ONLY the additive QUANTITY column gets a column SUM.
    // Order-level money is summed in JS over the per-order-deduped Map (counted
    // ONCE per order) and rendered as a cached literal — never a fan-out SUM.
    if (rows.length > 0) {
        const firstDataRow = h.headerRow + 1;
        const lastDataRow = h.headerRow + rows.length;

        let subtotalSum = 0;
        let vatAmountSum = 0;
        let finalTotalSum = 0;
        let buyTotalSum = 0;
        let baseOpsBuySum = 0;
        for (const m of moneyByOrder.values()) {
            subtotalSum += m.subtotal;
            vatAmountSum += m.vatAmount;
            finalTotalSum += m.finalTotal;
            buyTotalSum += m.buyTotal;
            baseOpsBuySum += m.baseOpsBuy;
        }

        const grand = addGrandTotalRow(sheet, {
            label: `GRAND TOTAL — ${ctx.companyName} (${moneyByOrder.size} orders)`,
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
            result: qtyGrandTotal,
        };
        // Order-level money: de-duped JS totals as literals (NOT column SUMs —
        // those would multiply by item count). Columns are fixed indices.
        grand.getCell(29).value = roundMoney(subtotalSum); // ORDER SUBTOTAL (EX VAT)
        grand.getCell(31).value = roundMoney(vatAmountSum); // ORDER VAT AMOUNT
        grand.getCell(32).value = roundMoney(finalTotalSum); // ORDER FINAL TOTAL (INC VAT)
        if (showMargin) {
            grand.getCell(34).value = roundMoney(buyTotalSum); // ORDER BUY TOTAL
            grand.getCell(35).value = roundMoney(baseOpsBuySum); // ORDER BASE OPS (BUY)
        }
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const ordersReport: ReportDefinition = {
    key: "orders",
    label: "Orders Export",
    description:
        "One row per order line item with order-level header context, per-item quantity/volume/weight, the curated company item code + category, and order financial totals. Order-level money appears once per order. Cost/margin columns are admin-only.",
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
        { key: "status", label: "Order Status", type: "status", required: false },
        { key: "group_id", label: "Group", type: "group", required: false, scope: "item" },
        { key: "team_id", label: "Team", type: "team", required: false, scope: "item" },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint: "narrow by date range, status, category, group, or team",
    },
    run,
};
