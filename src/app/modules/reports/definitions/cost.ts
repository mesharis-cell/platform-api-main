/**
 * Cost Report — ADMIN-only buy/margin reconciliation across ALL FOUR billing
 * entities (ORDER, SERVICE_REQUEST, SELF_PICKUP, INBOUND_REQUEST). Phase 2
 * broadens the legacy ORDER-only scope to the shared four-entity anchor,
 * mirroring the inclusion semantics of accounts-reconciliation.ts.
 *
 * One row per live, client-billable document showing TOTAL BUY COST, SELL TOTAL
 * (ex-VAT), MARGIN AMOUNT, derived MARGIN %, and the margin-override flag — so
 * finance can reconcile what the platform owes the warehouse against client
 * revenue per company over a date window.
 *
 * ORDER rows additionally carry the buy-side cost SPLIT (BASE_OPS / rate-card /
 * custom) + EVENT START / EVENT END. Those columns are BLANK on SR / SP / INBOUND
 * rows — only orders have the BASE_OPS system line + an event window. Every entity
 * shows a single BUY TOTAL.
 *
 * Inclusion is the shared BILLING SSOT: statusExcludeFragment (drops dead /
 * never-happened states — SUBMITTED-onward kept, widening the old CONFIRMED-onward
 * gate) + billableFilterFragment (drops internal SRs, no-cost self-pickups,
 * not-applicable orders/inbound), per entity arm. The optional entity_types filter
 * narrows WHICH arms participate (absent ⇒ all four).
 *
 * EVERY column is internal (buy / sell / margin). It is gated on ctx.canSeeMargin
 * and MUST NEVER appear on the client mount — audience stays ADMIN. The
 * buy/sell/margin split is computed in JS from prices.breakdown_lines via
 * PricingService.projectByRole(...,'ADMIN') — the engine owns the
 * billable/voided/rounding rules. SQL only assembles rows + applies scope.
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { PricingService } from "../../../services/pricing.service";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import { BillingEntity, billableFilterFragment, statusExcludeFragment } from "../shared/inclusion";
import { groupByCompany } from "../shared/group-by-company";
import type ExcelJS from "exceljs";
import {
    colLetter,
    colourStatus,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    fmtRangeLabel,
    MONEY_FMT,
    parseNum,
    ReportColumn,
    roundMoney,
    STYLE,
    sumRange,
} from "../../../utils/report-workbook";

const ROW_CAP = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ALL_ENTITIES: BillingEntity[] = [
    "ORDER",
    "SERVICE_REQUEST",
    "SELF_PICKUP",
    "INBOUND_REQUEST",
];

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

/** Resolve the optional entity_types param → the set of arms to UNION. Absent /
 *  empty ⇒ all four; otherwise the intersection with the four valid entities (in
 *  canonical order). Mirrors how category multi-values are accepted (string|string[]). */
function resolveEntities(raw: unknown): BillingEntity[] {
    const requested = toArr(raw)
        .map((s) => s.toUpperCase())
        .filter((s): s is BillingEntity => (ALL_ENTITIES as string[]).includes(s));
    if (!requested.length) return ALL_ENTITIES;
    return ALL_ENTITIES.filter((e) => requested.includes(e));
}

const paramsSchema = z
    .object({
        // Optional → when omitted, the report runs across ALL companies on the
        // platform (the controller sets ctx.allCompanies). Mirrors accounts-reconciliation.
        company_id: z.string().uuid().optional(),
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
        // Optional multi-select over the four billing entities. Absent/empty ⇒ all four.
        entity_types: z.union([z.string(), z.array(z.string())]).optional(),
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
    entity_type: BillingEntity;
    reference: string;
    doc_date: Date | string | null;
    status: string | null;
    financial_status: string | null;
    company_name: string | null;
    brand_name: string | null;
    event_start_date: Date | string | null;
    event_end_date: Date | string | null;
    breakdown_lines: unknown;
    margin_percent: string | number | null;
    vat_percent: string | number | null;
    margin_is_override: boolean | null;
    margin_override_reason: string | null;
    priced_at: Date | string | null;
    client_sell_override_total: string | null;
};

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    // Hard gate: every column on this report is buy / sell / margin. If the
    // caller cannot see margin (or it somehow reached a client mount), there is
    // no client-safe subset to render — refuse rather than emit an empty shell.
    if (!ctx.canSeeMargin || ctx.isClientMount) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "The Cost Report exposes buy cost and margin and is restricted to admins with margin visibility."
        );
    }

    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);
    const hasCategoryFilter = inc.length > 0 || exc.length > 0;
    const entities = resolveEntities(params.entity_types);

    // All-companies mode: drop the per-company filter and lean on platform_id scoping
    // (still present in every arm). Single-company mode: bind to ctx.companyId.
    const allCompanies = !!ctx.allCompanies;
    const orderCompanyScope = allCompanies ? sql`` : sql` AND o."company" = ${ctx.companyId}`;
    const srCompanyScope = allCompanies ? sql`` : sql` AND sr.company_id = ${ctx.companyId}`;
    const spCompanyScope = allCompanies ? sql`` : sql` AND sp.company_id = ${ctx.companyId}`;
    const inboundCompanyScope = allCompanies ? sql`` : sql` AND ir.company_id = ${ctx.companyId}`;

    // Per-entity category EXISTS subqueries (document-grained — keep the doc if it
    // has >=1 matching item), mirroring accounts-reconciliation.
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

    // Date filter is pinned to created_at across every arm (matches the legacy
    // report's order axis + accounts-reconciliation; preserves cross-report tie-out).
    // ── Per-entity UNION arms (mirror accounts-reconciliation join shapes) ────
    // ORDER carries event window + brand; SR/SP/INBOUND have neither an event
    // window nor (SR/INBOUND) a brand column → those select NULL for the columns
    // they don't have, so the split + event columns stay BLANK on non-order rows.
    const arms: Record<BillingEntity, SQL> = {
        ORDER: sql`
SELECT
    'ORDER' AS entity_type, o.order_id AS reference, o.created_at AS doc_date,
    o.order_status::text AS status, o.financial_status::text AS financial_status,
    c.name AS company_name, b.name AS brand_name,
    o.event_start_date AS event_start_date, o.event_end_date AS event_end_date,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at AS priced_at, NULL::text AS client_sell_override_total
FROM orders o
LEFT JOIN companies c ON o."company" = c.id
LEFT JOIN brands b ON o."brand" = b.id
LEFT JOIN prices p ON p.id = o.order_pricing_id
WHERE o.platform_id = ${ctx.platformId}
  ${orderCompanyScope}
  AND o.deleted_at IS NULL
  ${statusExcludeFragment(sql.raw("o.order_status"), "ORDER")}
  ${billableFilterFragment("o", "ORDER")}
  ${orderCategoryExists}
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}`,

        SERVICE_REQUEST: sql`
SELECT
    'SERVICE_REQUEST' AS entity_type, sr.service_request_id AS reference, sr.created_at AS doc_date,
    sr.request_status::text AS status, sr.commercial_status::text AS financial_status,
    c.name AS company_name, NULL::text AS brand_name,
    NULL::timestamp AS event_start_date, NULL::timestamp AS event_end_date,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at AS priced_at, sr.client_sell_override_total::text AS client_sell_override_total
FROM service_requests sr
LEFT JOIN companies c ON sr.company_id = c.id
LEFT JOIN prices p ON p.id = sr.request_pricing_id
WHERE sr.platform_id = ${ctx.platformId}
  ${srCompanyScope}
  ${statusExcludeFragment(sql.raw("sr.request_status"), "SERVICE_REQUEST")}
  ${billableFilterFragment("sr", "SERVICE_REQUEST")}
  ${srCategoryExists}
  ${dateFilter(sql.raw("sr.created_at"), gte, lt)}`,

        SELF_PICKUP: sql`
SELECT
    'SELF_PICKUP' AS entity_type, sp.self_pickup_id AS reference, sp.created_at AS doc_date,
    sp.self_pickup_status::text AS status, sp.financial_status::text AS financial_status,
    c.name AS company_name, b.name AS brand_name,
    NULL::timestamp AS event_start_date, NULL::timestamp AS event_end_date,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at AS priced_at, NULL::text AS client_sell_override_total
FROM self_pickups sp
LEFT JOIN companies c ON sp.company_id = c.id
LEFT JOIN brands b ON sp.brand_id = b.id
LEFT JOIN prices p ON p.platform_id = sp.platform_id AND p.entity_type = 'SELF_PICKUP' AND p.entity_id = sp.id
WHERE sp.platform_id = ${ctx.platformId}
  ${spCompanyScope}
  ${statusExcludeFragment(sql.raw("sp.self_pickup_status"), "SELF_PICKUP")}
  ${billableFilterFragment("sp", "SELF_PICKUP")}
  ${spCategoryExists}
  ${dateFilter(sql.raw("sp.created_at"), gte, lt)}`,

        INBOUND_REQUEST: sql`
SELECT
    'INBOUND_REQUEST' AS entity_type, ir.inbound_request_id AS reference, ir.created_at AS doc_date,
    ir.request_status::text AS status, ir.financial_status::text AS financial_status,
    c.name AS company_name, NULL::text AS brand_name,
    NULL::timestamp AS event_start_date, NULL::timestamp AS event_end_date,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at AS priced_at, NULL::text AS client_sell_override_total
FROM inbound_requests ir
LEFT JOIN companies c ON ir.company_id = c.id
LEFT JOIN prices p ON p.id = ir.request_pricing_id
WHERE ir.platform_id = ${ctx.platformId}
  ${inboundCompanyScope}
  ${statusExcludeFragment(sql.raw("ir.request_status"), "INBOUND_REQUEST")}
  ${billableFilterFragment("ir", "INBOUND_REQUEST")}
  ${inboundCategoryExists}
  ${dateFilter(sql.raw("ir.created_at"), gte, lt)}`,
    };

    const selected = entities.map((e) => arms[e]);
    const query = sql`${sql.join(
        selected,
        sql`
UNION ALL
`
    )}
ORDER BY company_name ASC, doc_date ASC, reference ASC`;

    const rows = ((await db.execute(query)) as any).rows as RawRow[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cost report has ${rows.length} documents (cap ${ROW_CAP}). Narrow by date range${
                allCompanies ? " (strongly recommended for all-companies runs)" : ""
            }, entities, or category.`
        );

    // All columns are internal (ctx.canSeeMargin already enforced above). The
    // BASE OPS / RATE CARD / CUSTOM split + EVENT START/END are ORDER-only and
    // render BLANK on SR/SP/INBOUND rows; every entity carries a TOTAL BUY COST.
    const columns: ReportColumn[] = [
        { header: "ENTITY TYPE", width: 16 },
        { header: "REFERENCE", width: 20 },
        { header: "COMPANY", width: 24 },
        { header: "BRAND", width: 20 },
        { header: "STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
        { header: "EVENT START", width: 13 },
        { header: "EVENT END", width: 13 },
        { header: "BASE OPS COST", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "RATE CARD COST", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "CUSTOM COST", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "TOTAL BUY COST", width: 16, align: "right", numFmt: MONEY_FMT },
        { header: "SELL TOTAL (EX VAT)", width: 17, align: "right", numFmt: MONEY_FMT },
        { header: "MARGIN AMOUNT", width: 15, align: "right", numFmt: MONEY_FMT },
        { header: "MARGIN %", width: 11, align: "right", numFmt: "#,##0.00" },
        { header: "MARGIN OVERRIDE", width: 16 },
        { header: "PRICED AT", width: 13 },
    ];

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Cost Report",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Cost",
    });
    const sheet = h.sheet;

    // 1-based column indices for the money columns we grand-total.
    const STATUS_COL = 5;
    const BASE_OPS = 9;
    const RATE_CARD = 10;
    const CUSTOM = 11;
    const TOTAL_BUY = 12;
    const SELL = 13;
    const MARGIN_AMT = 14;
    const LABEL = 8; // grand-total label sits under EVENT END (last non-money col)

    // Per-row rounded money — accumulated for the (sub)totals. BASE_OPS / RATE_CARD
    // / CUSTOM only contribute on ORDER rows (blank on the other three entities);
    // every entity contributes BUY / SELL / MARGIN.
    type Totals = {
        baseOps: number;
        rateCard: number;
        custom: number;
        buy: number;
        sell: number;
        margin: number;
    };

    const writeDataRow = (r: RawRow): Totals => {
        const isOrder = r.entity_type === "ORDER";
        const pricing = r.breakdown_lines
            ? {
                  breakdown_lines: r.breakdown_lines,
                  margin_percent: r.margin_percent,
                  vat_percent: r.vat_percent,
                  margin_is_override: r.margin_is_override,
                  margin_override_reason: r.margin_override_reason,
                  calculated_at: r.priced_at,
              }
            : null;
        // projectByRole(...,'ADMIN') returns the full BreakdownTotals: buy split
        // (buy_base_ops_total / buy_rate_card_total / buy_custom_total) +
        // buy_total / sell_total / margin_amount.
        const admin = PricingService.projectByRole(pricing as any, "ADMIN") as any;
        const totals = (admin?.totals ?? null) as {
            buy_base_ops_total?: unknown;
            buy_rate_card_total?: unknown;
            buy_custom_total?: unknown;
            buy_total?: unknown;
            sell_total?: unknown;
            sell_vat_percent?: unknown;
            margin_amount?: unknown;
        } | null;

        const baseOps = roundMoney(parseNum(totals?.buy_base_ops_total));
        const rateCard = roundMoney(parseNum(totals?.buy_rate_card_total));
        const custom = roundMoney(parseNum(totals?.buy_custom_total));
        const buyTotal = roundMoney(parseNum(totals?.buy_total));
        let sellTotal = roundMoney(parseNum(totals?.sell_total));
        let marginAmount = roundMoney(parseNum(totals?.margin_amount));

        // SR sell/margin override — honour client_sell_override_total (the SELL is
        // the override ex-VAT; margin re-derives against the same buy_total), to
        // keep cost↔revenue tie-out consistent with accounts-reconciliation.
        const overrideRaw =
            r.entity_type === "SERVICE_REQUEST" &&
            r.client_sell_override_total !== null &&
            r.client_sell_override_total !== ""
                ? r.client_sell_override_total
                : null;
        if (overrideRaw !== null) {
            const vatPercent = parseNum(totals?.sell_vat_percent ?? r.vat_percent);
            const overrideFinal = roundMoney(parseNum(overrideRaw));
            sellTotal = roundMoney(overrideFinal / (1 + vatPercent / 100));
            marginAmount = roundMoney(sellTotal - buyTotal);
        }

        // Derived / realized MARGIN % = margin_amount / buy_total * 100. Guard the
        // divide; with zero buy (empty pricing) margin % is N/A.
        const marginPct = buyTotal > 0 ? roundMoney((marginAmount / buyTotal) * 100) : null;

        const isOverride = !!r.margin_is_override;
        const overrideReason = r.margin_override_reason ? ` — ${r.margin_override_reason}` : "";

        // ORDER-only split + event columns; BLANK on the other three entities.
        const row = sheet.addRow([
            r.entity_type,
            r.reference ?? "",
            r.company_name ?? "",
            r.brand_name ?? "",
            r.status ?? "",
            r.financial_status ?? "",
            isOrder ? fmtDate(r.event_start_date) : "",
            isOrder ? fmtDate(r.event_end_date) : "",
            isOrder ? baseOps : "",
            isOrder ? rateCard : "",
            isOrder ? custom : "",
            buyTotal,
            sellTotal,
            marginAmount,
            marginPct === null ? "N/A" : marginPct,
            isOverride ? `YES${overrideReason}` : "NO",
            fmtDate(r.priced_at),
        ]);

        colourStatus(row.getCell(STATUS_COL), r.status ?? "");

        // Only order rows contribute to the split sub-totals (others are blank).
        return {
            baseOps: isOrder ? baseOps : 0,
            rateCard: isOrder ? rateCard : 0,
            custom: isOrder ? custom : 0,
            buy: buyTotal,
            sell: sellTotal,
            margin: marginAmount,
        };
    };

    const sumTotals = (list: Totals[]): Totals =>
        list.reduce<Totals>(
            (acc, t) => ({
                baseOps: acc.baseOps + t.baseOps,
                rateCard: acc.rateCard + t.rateCard,
                custom: acc.custom + t.custom,
                buy: acc.buy + t.buy,
                sell: acc.sell + t.sell,
                margin: acc.margin + t.margin,
            }),
            { baseOps: 0, rateCard: 0, custom: 0, buy: 0, sell: 0, margin: 0 }
        );

    // Cached (no SUM formula) totals row — used in all-companies mode where the
    // per-company subtotal rows are interleaved with data and would corrupt a
    // single contiguous SUM range.
    const writeCachedTotals = (label: string, t: Totals, fill: ExcelJS.Fill, big = false) => {
        const row = sheet.addRow([]);
        row.getCell(LABEL).value = label;
        row.font = big ? { bold: true, size: 12 } : { bold: true };
        if (big) row.height = 20;
        row.eachCell({ includeEmpty: true }, (cell) => (cell.fill = fill));
        const put = (col: number, val: number) => {
            row.getCell(col).value = roundMoney(val);
            row.getCell(col).numFmt = MONEY_FMT;
        };
        put(BASE_OPS, t.baseOps);
        put(RATE_CARD, t.rateCard);
        put(CUSTOM, t.custom);
        put(TOTAL_BUY, t.buy);
        put(SELL, t.sell);
        put(MARGIN_AMT, t.margin);
    };

    if (allCompanies) {
        const all: Totals[] = [];
        for (const g of groupByCompany(rows, (r) => r.company_name)) {
            const groupTotals: Totals[] = g.rows.map((r) => writeDataRow(r));
            all.push(...groupTotals);
            writeCachedTotals(
                `Subtotal — ${g.company}`,
                sumTotals(groupTotals),
                STYLE.SUBTOTAL_FILL
            );
            sheet.addRow([]); // spacer between companies
        }
        if (rows.length > 0)
            writeCachedTotals(
                `GRAND TOTAL — ${ctx.companyName}`,
                sumTotals(all),
                STYLE.GRAND_FILL,
                true
            );
    } else {
        // Single company → data rows are the first thing added (no banners), so the
        // block is contiguous from headerRow+1 for rows.length rows.
        const firstDataRow = h.headerRow + 1;
        const all: Totals[] = rows.map((r) => writeDataRow(r));
        // Grand-total row: GRAND BUY = Σ TOTAL BUY COST; GRAND SELL = Σ SELL TOTAL;
        // GRAND MARGIN = Σ MARGIN AMOUNT. Live SUM formulas spanning the data block.
        if (rows.length > 0) {
            const lastDataRow = firstDataRow + rows.length - 1;
            const grandTotals = sumTotals(all);
            const grand = sheet.addRow([]);
            grand.getCell(LABEL).value = `GRAND TOTAL — ${ctx.companyName}`;
            grand.font = { bold: true, size: 12 };
            grand.height = 20;
            grand.eachCell({ includeEmpty: true }, (cell) => (cell.fill = STYLE.GRAND_FILL));
            const setSum = (col: number, cached: number) => {
                const L = colLetter(col - 1);
                grand.getCell(col).value = {
                    formula: sumRange(L, firstDataRow, lastDataRow),
                    result: roundMoney(cached),
                };
                grand.getCell(col).numFmt = MONEY_FMT;
            };
            setSum(BASE_OPS, grandTotals.baseOps);
            setSum(RATE_CARD, grandTotals.rateCard);
            setSum(CUSTOM, grandTotals.custom);
            setSum(TOTAL_BUY, grandTotals.buy);
            setSum(SELL, grandTotals.sell);
            setSum(MARGIN_AMT, grandTotals.margin);
        }
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const costReport: ReportDefinition = {
    key: "cost",
    label: "Cost Report",
    description:
        "Admin-only per-document buy-side cost (what the platform owes the warehouse) across orders, service requests, self-pickups and inbound requests — live client-billable documents only (excludes internal SRs, no-cost self-pickups, not-applicable orders/inbound, and dead/cancelled docs). Every document shows total buy cost, sell total (ex-VAT), margin amount and realized margin %; orders additionally show the BASE_OPS / rate-card / custom split + event window. Leave Company blank to run across ALL companies on the platform (grouped, with per-company subtotals + an overall total) — use a date range for all-companies runs. Use Entities to narrow to specific document types. Exposes cost and margin — never client-facing.",
    section: "FINANCIAL",
    audience: "ADMIN",
    operationsRoles: ["ADMIN"],
    permissions: ["orders:export"],
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
            scope: "document",
        },
        {
            key: "entity_types",
            label: "Entities",
            type: "entity-toggle",
            required: false,
            options: ALL_ENTITIES.map((e) => ({ value: e, label: e })),
            default: ALL_ENTITIES,
        },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint:
            "narrow by date range (strongly recommended for all-companies runs), entities, or category",
    },
    run,
};
