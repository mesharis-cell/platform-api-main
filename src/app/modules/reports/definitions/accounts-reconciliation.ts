/**
 * Accounts Reconciliation / Billable Charges — per-tenant billables ledger across
 * all four commercial entities (ORDER, SERVICE_REQUEST, SELF_PICKUP,
 * INBOUND_REQUEST), filtered to CLIENT-BILLABLE documents only:
 *   - service requests with commercial_status = INTERNAL  → excluded
 *   - self-pickups with pricing_mode = NO_COST            → excluded
 *   - orders / inbound with financial_status = NOT_APPLICABLE → excluded
 * Zero-total STANDARD documents are KEPT (a 0 on a billable doc is a signal —
 * un-priced / anomalous — finance needs to see and chase, not hide).
 *
 * Two grains, via the optional `detail` filter:
 *   - summary (default): one row per document with buy / sell / margin / VAT /
 *     final totals (projected from the prices snapshot).
 *   - line-item: one row per pricing line (the prices.breakdown_lines), grouped
 *     under each document with per-document Subtotal / VAT / Total rows — so
 *     finance sees exactly which charges make up each bill.
 *
 * Money is projected in JS via PricingService.projectByRole(row,'ADMIN') — not
 * summed in SQL. BUY / MARGIN columns are gated on ctx.canSeeMargin (client mount
 * sees sell-only). SERVICE REQUEST sell/final honours client_sell_override_total
 * (summary grain only; line-item shows the projected per-line charges).
 *
 * Invoice/payment tracking columns were intentionally removed — this is a pure
 * "what is billable" sheet, not a quoted-vs-invoiced-vs-paid reconciliation.
 *
 * FINANCIAL · ADMIN-only (never client-mounted) → LEAK_RISK report.
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
        // summary (default) → one row per document; line-item → per charge line.
        detail: z.string().optional(),
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

type RawRow = {
    document_type: "ORDER" | "SERVICE_REQUEST" | "SELF_PICKUP" | "INBOUND_REQUEST";
    reference: string;
    document_date: Date | string | null;
    company: string | null;
    context_name: string | null;
    operational_status: string | null;
    financial_status: string | null;
    breakdown_lines: unknown;
    margin_percent: string | number | null;
    vat_percent: string | number | null;
    margin_is_override: boolean | null;
    margin_override_reason: string | null;
    calculated_at: Date | string | null;
    client_sell_override_total: string | null;
};

type LineRow = { label: string; category: string; quantity: number; buy: number; sell: number };

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const detailMode = String(params.detail ?? "") === "line-item";
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);
    const hasCategoryFilter = inc.length > 0 || exc.length > 0;

    const orderCategoryExists = hasCategoryFilter
        ? sql` AND EXISTS (SELECT 1 FROM order_items oi LEFT JOIN assets a ON oi.asset = a.id WHERE oi."order" = o.id ${cat})`
        : sql``;
    const srCategoryExists = hasCategoryFilter
        ? sql` AND EXISTS (SELECT 1 FROM service_request_items sri LEFT JOIN assets a ON sri.asset_id = a.id WHERE sri.service_request_id = sr.id ${cat})`
        : sql``;
    const spCategoryExists = hasCategoryFilter
        ? sql` AND EXISTS (SELECT 1 FROM self_pickup_items spi LEFT JOIN assets a ON spi.asset_id = a.id WHERE spi.self_pickup_id = sp.id ${cat})`
        : sql``;
    const inboundCategoryExists = hasCategoryFilter
        ? sql` AND EXISTS (SELECT 1 FROM inbound_request_items iri LEFT JOIN assets a ON iri.asset_id = a.id WHERE iri.inbound_request_id = ir.id ${cat})`
        : sql``;

    const query = sql`
SELECT
    'ORDER' AS document_type, o.order_id AS reference, o.created_at AS document_date,
    co.name AS company, o.venue_name AS context_name,
    o.order_status::text AS operational_status, o.financial_status::text AS financial_status,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, NULL::text AS client_sell_override_total
FROM orders o
JOIN companies co ON o.company = co.id
LEFT JOIN prices p ON p.id = o.order_pricing_id
WHERE o.platform_id = ${ctx.platformId}
  AND o.company = ${ctx.companyId}
  AND o.deleted_at IS NULL
  AND o.order_status NOT IN ('DRAFT', 'CANCELLED')
  AND o.financial_status <> 'NOT_APPLICABLE'
  ${orderCategoryExists}
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}

UNION ALL

SELECT
    'SERVICE_REQUEST' AS document_type, sr.service_request_id AS reference, sr.created_at AS document_date,
    co.name AS company, sr.title AS context_name,
    sr.request_status::text AS operational_status, sr.commercial_status::text AS financial_status,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, sr.client_sell_override_total::text AS client_sell_override_total
FROM service_requests sr
JOIN companies co ON sr.company_id = co.id
LEFT JOIN prices p ON p.id = sr.request_pricing_id
WHERE sr.platform_id = ${ctx.platformId}
  AND sr.company_id = ${ctx.companyId}
  AND sr.request_status NOT IN ('DRAFT', 'CANCELLED')
  AND sr.commercial_status <> 'INTERNAL'
  ${srCategoryExists}
  ${dateFilter(sql.raw("sr.created_at"), gte, lt)}

UNION ALL

SELECT
    'SELF_PICKUP' AS document_type, sp.self_pickup_id AS reference, sp.created_at AS document_date,
    co.name AS company, ('Collector: ' || sp.collector_name) AS context_name,
    sp.self_pickup_status::text AS operational_status, sp.financial_status::text AS financial_status,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, NULL::text AS client_sell_override_total
FROM self_pickups sp
JOIN companies co ON sp.company_id = co.id
LEFT JOIN prices p ON p.platform_id = sp.platform_id AND p.entity_type = 'SELF_PICKUP' AND p.entity_id = sp.id
WHERE sp.platform_id = ${ctx.platformId}
  AND sp.company_id = ${ctx.companyId}
  AND sp.self_pickup_status NOT IN ('DECLINED', 'CANCELLED')
  AND sp.pricing_mode <> 'NO_COST'
  ${spCategoryExists}
  ${dateFilter(sql.raw("sp.created_at"), gte, lt)}

UNION ALL

SELECT
    'INBOUND_REQUEST' AS document_type, ir.inbound_request_id AS reference, ir.created_at AS document_date,
    co.name AS company, COALESCE(ir.note, '') AS context_name,
    ir.request_status::text AS operational_status, ir.financial_status::text AS financial_status,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, NULL::text AS client_sell_override_total
FROM inbound_requests ir
JOIN companies co ON ir.company_id = co.id
LEFT JOIN prices p ON p.id = ir.request_pricing_id
WHERE ir.platform_id = ${ctx.platformId}
  AND ir.company_id = ${ctx.companyId}
  AND ir.request_status NOT IN ('DECLINED', 'CANCELLED')
  AND ir.financial_status <> 'NOT_APPLICABLE'
  ${inboundCategoryExists}
  ${dateFilter(sql.raw("ir.created_at"), gte, lt)}

ORDER BY document_date ASC`;

    const rows = ((await db.execute(query)) as any).rows as RawRow[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Report has ${rows.length} documents (cap ${ROW_CAP}). Narrow by date range or category.`
        );

    type Doc = {
        raw: RawRow;
        buyTotal: number;
        sellSubtotal: number;
        marginAmount: number;
        marginPercent: number;
        vatPercent: number;
        vatAmount: number;
        finalTotal: number;
        lines: LineRow[];
    };

    const docs: Doc[] = rows.map((r) => {
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

        // SR sell/final override (summary grain only — line-item shows projected lines).
        const overrideRaw =
            r.document_type === "SERVICE_REQUEST" &&
            r.client_sell_override_total !== null &&
            r.client_sell_override_total !== ""
                ? r.client_sell_override_total
                : null;
        if (overrideRaw !== null && !detailMode) {
            finalTotal = roundMoney(parseNum(overrideRaw));
            sellSubtotal = roundMoney(finalTotal / (1 + vatPercent / 100));
            vatAmount = roundMoney(finalTotal - sellSubtotal);
        }

        const lines: LineRow[] = (detail?.lines ?? [])
            .filter((l: any) => !l.is_voided)
            .map((l: any) => {
                const qty = parseNum(l.quantity);
                const buy = roundMoney(parseNum(l.buy_total ?? parseNum(l.buy_unit_price) * qty));
                const sell = roundMoney(
                    parseNum(l.sell_total ?? parseNum(l.sell_unit_price) * qty)
                );
                return {
                    label: String(l.label ?? ""),
                    category: String(l.category ?? "OTHER"),
                    quantity: qty,
                    buy,
                    sell,
                };
            });

        return {
            raw: r,
            buyTotal,
            sellSubtotal,
            marginAmount: roundMoney(sellSubtotal - buyTotal),
            marginPercent,
            vatPercent,
            vatAmount,
            finalTotal,
            lines,
        };
    });

    const showMargin = ctx.canSeeMargin && !ctx.isClientMount;

    // ── Common leading columns (document context) ────────────────────────────
    const baseColumns: ReportColumn[] = [
        { header: "DOCUMENT TYPE", width: 16 },
        { header: "KADENCE REFERENCE", width: 20 },
        { header: "DOCUMENT DATE", width: 14 },
        { header: "COMPANY", width: 24 },
        { header: "CONTEXT NAME", width: 30 },
        { header: "OPERATIONAL STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
    ];

    const ctxCells = (r: RawRow): (string | number)[] => [
        r.document_type,
        r.reference,
        fmtDate(r.document_date),
        r.company ?? "",
        r.context_name ?? "",
        r.operational_status ?? "",
        r.financial_status ?? "",
    ];

    if (detailMode) {
        // ── LINE-ITEM grain: charge lines grouped per document ───────────────
        const columns: ReportColumn[] = [
            ...baseColumns,
            { header: "DESCRIPTION", width: 36 },
            { header: "CATEGORY", width: 16 },
            { header: "QUANTITY", width: 10, align: "right", numFmt: INT_FMT },
        ];
        if (showMargin)
            columns.push({ header: "BUY", width: 13, align: "right", numFmt: MONEY_FMT });
        columns.push({ header: "SELL", width: 13, align: "right", numFmt: MONEY_FMT });
        if (showMargin)
            columns.push({ header: "MARGIN", width: 13, align: "right", numFmt: MONEY_FMT });

        const h = createReportWorkbook({
            companyName: ctx.companyName,
            label: "Billable Charges (line-item)",
            subtitle: fmtRangeLabel(params.date_from, params.date_to),
            columns,
            sheetName: "Charges",
        });
        const sheet = h.sheet;
        const DESC = 8; // first line-detail column (after the 7 document-context columns)
        const BUY_C = DESC + 3;
        const SELL_C = showMargin ? DESC + 4 : DESC + 3;
        const MARGIN_C = DESC + 5;
        const lastCol = columns.length;
        const money = (col: number, val: number, bold = true) => {
            const c = sheet.lastRow!.getCell(col);
            c.value = val;
            c.numFmt = MONEY_FMT;
            if (bold) c.font = { bold: true };
        };
        const edge = (row: any, side: "top" | "bottom", style: "thin" | "medium") => {
            for (let c = 1; c <= lastCol; c += 1)
                row.getCell(c).border = { ...(row.getCell(c).border || {}), [side]: { style } };
        };

        let gBuy = 0;
        let gSell = 0;
        let gMargin = 0;
        let gFinal = 0;
        for (const d of docs) {
            // Entity header — document context, shaded + top border (opens the block).
            const hdr = sheet.addRow([...ctxCells(d.raw)]);
            hdr.font = { bold: true };
            for (let c = 1; c <= lastCol; c += 1) hdr.getCell(c).fill = STYLE.SECTION_FILL;
            edge(hdr, "top", "medium");

            // Charge lines — context columns blank (the header carries the document).
            const linesToRender = d.lines.length
                ? d.lines
                : [{ label: "(no priced charges)", category: "", quantity: 0, buy: 0, sell: 0 }];
            for (const ln of linesToRender) {
                const cells: (string | number)[] = [
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    ln.label,
                    ln.category,
                    ln.quantity,
                ];
                if (showMargin) cells.push(ln.buy);
                cells.push(ln.sell);
                if (showMargin) cells.push(roundMoney(ln.sell - ln.buy));
                sheet.addRow(cells);
            }

            // Footer — Subtotal / VAT / Total; Total bottom-bordered closes the block.
            const sub = sheet.addRow([]);
            sub.getCell(DESC).value = `Subtotal — ${d.raw.reference}`;
            sub.font = { bold: true };
            edge(sub, "top", "thin");
            if (showMargin) money(BUY_C, d.buyTotal);
            money(SELL_C, d.sellSubtotal);
            if (showMargin) money(MARGIN_C, d.marginAmount);

            const vatRow = sheet.addRow([]);
            vatRow.getCell(DESC).value = `VAT ${d.vatPercent}%`;
            money(SELL_C, d.vatAmount, false);

            const totRow = sheet.addRow([]);
            totRow.getCell(DESC).value = `Total — ${d.raw.reference}`;
            totRow.font = { bold: true };
            money(SELL_C, d.finalTotal);
            edge(totRow, "bottom", "medium");

            sheet.addRow([]); // spacer between blocks

            gBuy += d.buyTotal;
            gSell += d.sellSubtotal;
            gMargin += d.marginAmount;
            gFinal += d.finalTotal;
        }

        if (docs.length > 0) {
            const grand = sheet.addRow([]);
            grand.getCell(1).value = `GRAND TOTAL — ${ctx.companyName} (ex-VAT)`;
            grand.font = { bold: true, size: 12 };
            grand.height = 20;
            grand.eachCell({ includeEmpty: true }, (c) => (c.fill = STYLE.GRAND_FILL));
            if (showMargin) money(BUY_C, roundMoney(gBuy));
            money(SELL_C, roundMoney(gSell));
            if (showMargin) money(MARGIN_C, roundMoney(gMargin));

            const grandV = sheet.addRow([]);
            grandV.getCell(1).value = `GRAND TOTAL — ${ctx.companyName} (incl VAT)`;
            grandV.font = { bold: true, size: 12 };
            grandV.eachCell({ includeEmpty: true }, (c) => (c.fill = STYLE.GRAND_FILL));
            money(SELL_C, roundMoney(gFinal));
        }

        finalizeWorkbook(h, docs.length);
        return { wb: h.wb, rowCount: docs.length };
    }

    // ── SUMMARY grain: one row per document ──────────────────────────────────
    const columns: ReportColumn[] = [...baseColumns];
    if (showMargin)
        columns.push({ header: "BUY TOTAL", width: 14, align: "right", numFmt: MONEY_FMT });
    columns.push({ header: "SELL SUBTOTAL", width: 14, align: "right", numFmt: MONEY_FMT });
    if (showMargin) {
        columns.push({ header: "MARGIN AMOUNT", width: 14, align: "right", numFmt: MONEY_FMT });
        columns.push({ header: "MARGIN %", width: 10, align: "right", numFmt: INT_FMT });
    }
    columns.push({ header: "VAT %", width: 8, align: "right", numFmt: INT_FMT });
    columns.push({ header: "VAT AMOUNT", width: 13, align: "right", numFmt: MONEY_FMT });
    columns.push({ header: "FINAL TOTAL", width: 14, align: "right", numFmt: MONEY_FMT });

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Accounts Reconciliation",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Reconciliation",
    });
    const sheet = h.sheet;
    const colIdx = (header: string) => columns.findIndex((c) => c.header === header) + 1;
    const BUY_COL = showMargin ? colIdx("BUY TOTAL") : 0;
    const SELL_COL = colIdx("SELL SUBTOTAL");
    const MARGIN_COL = showMargin ? colIdx("MARGIN AMOUNT") : 0;
    const VATAMT_COL = colIdx("VAT AMOUNT");
    const FINAL_COL = colIdx("FINAL TOTAL");

    let firstData = 0;
    let lastData = 0;
    for (const d of docs) {
        const cells: (string | number)[] = [...ctxCells(d.raw)];
        if (showMargin) cells.push(d.buyTotal);
        cells.push(d.sellSubtotal);
        if (showMargin) {
            cells.push(d.marginAmount);
            cells.push(d.marginPercent);
        }
        cells.push(d.vatPercent);
        cells.push(d.vatAmount);
        cells.push(d.finalTotal);
        const row = sheet.addRow(cells);
        if (!firstData) firstData = row.number;
        lastData = row.number;
    }

    if (docs.length > 0) {
        const reduceSum = (sel: (d: Doc) => number) =>
            roundMoney(docs.reduce((n, d) => n + sel(d), 0));
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
        if (showMargin)
            setSum(
                BUY_COL,
                reduceSum((d) => d.buyTotal)
            );
        setSum(
            SELL_COL,
            reduceSum((d) => d.sellSubtotal)
        );
        if (showMargin)
            setSum(
                MARGIN_COL,
                reduceSum((d) => d.marginAmount)
            );
        setSum(
            VATAMT_COL,
            reduceSum((d) => d.vatAmount)
        );
        setSum(
            FINAL_COL,
            reduceSum((d) => d.finalTotal)
        );
    }

    finalizeWorkbook(h, docs.length);
    return { wb: h.wb, rowCount: docs.length };
}

export const accountsReconciliationReport: ReportDefinition = {
    key: "accounts-reconciliation",
    label: "Accounts Reconciliation",
    description:
        "Per-tenant billables ledger across orders, service requests, self-pickups and inbound requests — client-billable documents only (excludes internal SRs, no-cost self-pickups, not-applicable orders/inbound). Toggle 'Line-item breakdown' to expand each document into its individual charge lines with per-document subtotal/VAT/total. ADMIN-only.",
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
        {
            key: "detail",
            label: "Detail",
            type: "status",
            required: false,
            allLabel: "Summary (per document)",
            options: [{ value: "line-item", label: "Line-item breakdown" }],
        },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint: "narrow by date range or category",
    },
    run,
};
