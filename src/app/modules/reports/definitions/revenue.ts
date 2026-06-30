/**
 * Revenue Report — per-document SELL-SIDE revenue ledger across ALL FOUR billing
 * entities (ORDER, SERVICE_REQUEST, SELF_PICKUP, INBOUND_REQUEST). Phase 2 broadens
 * the legacy ORDER-only scope to the shared four-entity anchor, mirroring the
 * inclusion semantics of accounts-reconciliation.ts.
 *
 * One row per live, client-billable document showing its sell-side pricing
 * snapshot (subtotal, VAT%, VAT amount, final) plus — gated on margin visibility —
 * buy total + margin. Grand-total row at the bottom.
 *
 * Inclusion is the shared BILLING SSOT: statusExcludeFragment (drops the dead /
 * never-happened states) + billableFilterFragment (drops internal SRs, no-cost
 * self-pickups, not-applicable orders/inbound), per entity arm. The optional
 * entity_types filter narrows WHICH arms participate (absent ⇒ all four).
 *
 * Money columns are NOT queryable scalars: prices.breakdown_lines + margin/vat are
 * projected in JS via PricingService.projectByRole(row,'ADMIN'). SERVICE REQUEST
 * sell/final honours client_sell_override_total exactly like accounts-reconciliation.
 *
 * FINANCIAL · ADMIN-only — never mounted client-side (carries BUY/MARGIN).
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
    addCells,
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

type RawRow = {
    entity_type: BillingEntity;
    reference: string;
    doc_date: Date | string | null;
    status: string | null;
    financial_status: string | null;
    company: string | null;
    brand: string | null;
    created_by: string | null;
    breakdown_lines: unknown;
    margin_percent: string | number | null;
    vat_percent: string | number | null;
    margin_is_override: boolean | null;
    margin_override_reason: string | null;
    calculated_at: Date | string | null;
    client_sell_override_total: string | null;
};

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    // FINANCIAL / admin-only: this report carries (or may carry) BUY + MARGIN.
    // The client mount must never reach it; reject defensively even though the
    // route gating should already prevent it.
    if (ctx.isClientMount)
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Revenue Report is not available on the client portal."
        );

    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);
    const hasCategoryFilter = inc.length > 0 || exc.length > 0;
    const entities = resolveEntities(params.entity_types);

    // All-companies mode: drop the per-company filter and lean on platform_id scoping
    // (still present in every arm). Single-company mode: bind to ctx.companyId.
    const allCompanies = !!ctx.allCompanies;
    const orderCompanyScope = allCompanies ? sql`` : sql` AND o.company = ${ctx.companyId}`;
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

    // TEAM filter is order-item specific (assets.team_id via order_items). It is
    // applied to the ORDER arm ONLY — a no-op on SR/SP/INBOUND — preserving the
    // legacy single-entity behaviour without overreaching the team concept onto
    // entities that have no equivalent item→team relationship.
    const orderTeamExists = params.team_id
        ? sql` AND EXISTS (SELECT 1 FROM order_items oi JOIN assets a ON oi.asset = a.id WHERE oi."order" = o.id AND a.team_id = ${params.team_id})`
        : sql``;

    // ── Per-entity UNION arms (mirror accounts-reconciliation join shapes) ────
    const arms: Record<BillingEntity, SQL> = {
        ORDER: sql`
SELECT
    o.created_at AS doc_date, 'ORDER' AS entity_type, o.order_id AS reference,
    o.order_status::text AS status, o.financial_status::text AS financial_status,
    c.name AS company, b.name AS brand, u.name AS created_by,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, NULL::text AS client_sell_override_total
FROM orders o
LEFT JOIN companies c ON o.company = c.id
LEFT JOIN brands b ON o.brand = b.id
LEFT JOIN users u ON o.created_by = u.id
LEFT JOIN prices p ON p.id = o.order_pricing_id
WHERE o.platform_id = ${ctx.platformId}
  ${orderCompanyScope}
  AND o.deleted_at IS NULL
  ${statusExcludeFragment(sql.raw("o.order_status"), "ORDER")}
  ${billableFilterFragment("o", "ORDER")}
  ${orderCategoryExists}
  ${orderTeamExists}
  ${dateFilter(sql.raw("o.created_at"), gte, lt)}`,

        // SR + INBOUND have no brand_id column → BRAND is NULL on those arms
        // (only ORDER + SELF_PICKUP carry a brand).
        SERVICE_REQUEST: sql`
SELECT
    sr.created_at AS doc_date, 'SERVICE_REQUEST' AS entity_type, sr.service_request_id AS reference,
    sr.request_status::text AS status, sr.commercial_status::text AS financial_status,
    c.name AS company, NULL::text AS brand, u.name AS created_by,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, sr.client_sell_override_total::text AS client_sell_override_total
FROM service_requests sr
LEFT JOIN companies c ON sr.company_id = c.id
LEFT JOIN users u ON sr.created_by = u.id
LEFT JOIN prices p ON p.id = sr.request_pricing_id
WHERE sr.platform_id = ${ctx.platformId}
  ${srCompanyScope}
  ${statusExcludeFragment(sql.raw("sr.request_status"), "SERVICE_REQUEST")}
  ${billableFilterFragment("sr", "SERVICE_REQUEST")}
  ${srCategoryExists}
  ${dateFilter(sql.raw("sr.created_at"), gte, lt)}`,

        SELF_PICKUP: sql`
SELECT
    sp.created_at AS doc_date, 'SELF_PICKUP' AS entity_type, sp.self_pickup_id AS reference,
    sp.self_pickup_status::text AS status, sp.financial_status::text AS financial_status,
    c.name AS company, b.name AS brand, u.name AS created_by,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, NULL::text AS client_sell_override_total
FROM self_pickups sp
LEFT JOIN companies c ON sp.company_id = c.id
LEFT JOIN brands b ON sp.brand_id = b.id
LEFT JOIN users u ON sp.created_by = u.id
LEFT JOIN prices p ON p.platform_id = sp.platform_id AND p.entity_type = 'SELF_PICKUP' AND p.entity_id = sp.id
WHERE sp.platform_id = ${ctx.platformId}
  ${spCompanyScope}
  ${statusExcludeFragment(sql.raw("sp.self_pickup_status"), "SELF_PICKUP")}
  ${billableFilterFragment("sp", "SELF_PICKUP")}
  ${spCategoryExists}
  ${dateFilter(sql.raw("sp.created_at"), gte, lt)}`,

        INBOUND_REQUEST: sql`
SELECT
    ir.created_at AS doc_date, 'INBOUND_REQUEST' AS entity_type, ir.inbound_request_id AS reference,
    ir.request_status::text AS status, ir.financial_status::text AS financial_status,
    c.name AS company, NULL::text AS brand, u.name AS created_by,
    p.breakdown_lines, p.margin_percent, p.vat_percent, p.margin_is_override,
    p.margin_override_reason, p.calculated_at, NULL::text AS client_sell_override_total
FROM inbound_requests ir
LEFT JOIN companies c ON ir.company_id = c.id
LEFT JOIN users u ON ir.created_by = u.id
LEFT JOIN prices p ON p.id = ir.request_pricing_id
WHERE ir.platform_id = ${ctx.platformId}
  ${inboundCompanyScope}
  ${statusExcludeFragment(sql.raw("ir.request_status"), "INBOUND_REQUEST")}
  ${billableFilterFragment("ir", "INBOUND_REQUEST")}
  ${inboundCategoryExists}
  ${dateFilter(sql.raw("ir.created_at"), gte, lt)}`,
    };

    const selected = entities.map((e) => arms[e]);
    // DATE AXIS → created_at across every arm (Phase 2 deliberate switch from the
    // legacy COALESCE(outbound_scan, created_at) issued-date axis: a created_at
    // axis is uniform across all four entities and matches accounts-reconciliation;
    // self-pickups / SRs / inbound have no outbound-scan proxy).
    const query = sql`${sql.join(
        selected,
        sql`
UNION ALL
`
    )}
ORDER BY company ASC, doc_date ASC`;

    const rows = ((await db.execute(query)) as any).rows as RawRow[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Revenue ledger has ${rows.length} rows (cap ${ROW_CAP}). Narrow by date range${
                allCompanies ? " (strongly recommended for all-companies runs)" : ""
            }, entities, team, or category.`
        );

    // Sell columns are always allowed; cost/margin only with margin visibility.
    const columns: ReportColumn[] = [
        { header: "DOC DATE", width: 13 },
        { header: "ENTITY TYPE", width: 16 },
        { header: "REFERENCE", width: 20 },
        { header: "STATUS", width: 18 },
        { header: "FINANCIAL STATUS", width: 18 },
        { header: "COMPANY", width: 24 },
        { header: "BRAND", width: 20 },
        { header: "CREATED BY", width: 20 },
        { header: "SUBTOTAL", width: 14, align: "right", numFmt: MONEY_FMT },
        { header: "VAT %", width: 9, align: "right" },
        { header: "VAT AMOUNT", width: 14, align: "right", numFmt: MONEY_FMT },
        { header: "FINAL TOTAL", width: 15, align: "right", numFmt: MONEY_FMT },
    ];
    if (ctx.canSeeMargin) {
        columns.push(
            { header: "BUY TOTAL", width: 14, align: "right", numFmt: MONEY_FMT },
            { header: "MARGIN AMOUNT", width: 15, align: "right", numFmt: MONEY_FMT },
            { header: "MARGIN %", width: 11, align: "right" }
        );
    }

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        label: "Revenue Report",
        subtitle: fmtRangeLabel(params.date_from, params.date_to),
        columns,
        sheetName: "Revenue",
    });
    const sheet = h.sheet;

    // 1-based column indexes.
    const STATUS_COL = 4;
    const SUBTOTAL = 9;
    const VAT_PCT = 10;
    const VAT_AMOUNT = 11;
    const FINAL_TOTAL = 12;
    const BUY_TOTAL = 13;
    const MARGIN_AMOUNT = 14;
    const LABEL = 8; // "CREATED BY" column carries the grand-total label.
    const SUBTOTAL_L = colLetter(SUBTOTAL - 1);
    const VAT_AMOUNT_L = colLetter(VAT_AMOUNT - 1);
    const VAT_PCT_L = colLetter(VAT_PCT - 1);

    // Per-row projected money — accumulated for the (sub)totals. The per-row VAT
    // AMOUNT + FINAL TOTAL cells stay LIVE formulas in BOTH modes (they reference
    // only their own row, so interleaved subtotal rows never corrupt them — only
    // the AGGREGATE total cells switch to cached in all-companies mode).
    type Totals = {
        subtotal: number;
        vatAmount: number;
        finalTotal: number;
        buyTotal: number;
        marginAmount: number;
    };

    const writeDataRow = (r: RawRow): Totals => {
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

        let subtotal = roundMoney(parseNum(totals?.sell_total));
        const vatPercent = parseNum(totals?.sell_vat_percent ?? r.vat_percent);
        let vatAmount = roundMoney(parseNum(totals?.sell_vat_amount));
        let finalTotal = roundMoney(parseNum(totals?.sell_total_with_vat));
        const buyTotal = roundMoney(parseNum(totals?.buy_total));

        // SR sell/final override — honour client_sell_override_total exactly as
        // accounts-reconciliation does: the final IS the override; subtotal + VAT
        // are derived back-out from the frozen VAT%.
        const overrideRaw =
            r.entity_type === "SERVICE_REQUEST" &&
            r.client_sell_override_total !== null &&
            r.client_sell_override_total !== ""
                ? r.client_sell_override_total
                : null;
        if (overrideRaw !== null) {
            finalTotal = roundMoney(parseNum(overrideRaw));
            subtotal = roundMoney(finalTotal / (1 + vatPercent / 100));
            vatAmount = roundMoney(finalTotal - subtotal);
        }

        // Margin is sell-ex-VAT minus buy (VAT is pass-through, never margin).
        const marginAmount = roundMoney(subtotal - buyTotal);
        const marginPercent = parseNum(detail?.margin_policy?.percent ?? r.margin_percent);

        const cells: any[] = [
            fmtDate(r.doc_date),
            r.entity_type,
            r.reference ?? "",
            r.status ?? "",
            r.financial_status ?? "",
            r.company ?? "",
            r.brand ?? "",
            r.created_by ?? "",
            subtotal,
            vatPercent,
            // VAT AMOUNT + FINAL TOTAL are written as LIVE formulas below (once the
            // row number is known); seed with the cached numbers as a placeholder.
            vatAmount,
            finalTotal,
        ];
        if (ctx.canSeeMargin) {
            cells.push(buyTotal, marginAmount, marginPercent);
        }
        const row = sheet.addRow(cells);

        // Compounded cells are LIVE Excel formulas (cached result rounds to the JS
        // value). VAT AMOUNT = SUBTOTAL * VAT% / 100; FINAL TOTAL = SUBTOTAL + VAT.
        // For SR-override rows these still reconcile because SUBTOTAL was derived
        // back-out from the override at the frozen VAT%.
        const vatCell = row.getCell(VAT_AMOUNT);
        vatCell.value = {
            formula: `${SUBTOTAL_L}${row.number}*${VAT_PCT_L}${row.number}/100`,
            result: vatAmount,
        };
        vatCell.numFmt = MONEY_FMT;
        const finalCell = row.getCell(FINAL_TOTAL);
        finalCell.value = {
            formula: addCells(SUBTOTAL_L, row.number, VAT_AMOUNT_L, row.number),
            result: finalTotal,
        };
        finalCell.numFmt = MONEY_FMT;
        colourStatus(row.getCell(STATUS_COL), r.status ?? "");

        return { subtotal, vatAmount, finalTotal, buyTotal, marginAmount };
    };

    const sumTotals = (list: Totals[]): Totals =>
        list.reduce<Totals>(
            (acc, t) => ({
                subtotal: acc.subtotal + t.subtotal,
                vatAmount: acc.vatAmount + t.vatAmount,
                finalTotal: acc.finalTotal + t.finalTotal,
                buyTotal: acc.buyTotal + t.buyTotal,
                marginAmount: acc.marginAmount + t.marginAmount,
            }),
            { subtotal: 0, vatAmount: 0, finalTotal: 0, buyTotal: 0, marginAmount: 0 }
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
        put(SUBTOTAL, t.subtotal);
        put(VAT_AMOUNT, t.vatAmount);
        put(FINAL_TOTAL, t.finalTotal);
        if (ctx.canSeeMargin) {
            put(BUY_TOTAL, t.buyTotal);
            put(MARGIN_AMOUNT, t.marginAmount);
        }
    };

    if (allCompanies) {
        const all: Totals[] = [];
        for (const g of groupByCompany(rows, (r) => r.company)) {
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
        const firstDataRow = h.headerRow + 1;
        const all: Totals[] = rows.map((r) => writeDataRow(r));
        if (rows.length > 0) {
            const lastDataRow = firstDataRow + rows.length - 1;
            const grandTotals = sumTotals(all);
            // Single company → flat ledger (no interleaved subtotals) → the amber
            // grand-total row sums the full data range directly with live SUM formulas.
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
            setSum(SUBTOTAL, grandTotals.subtotal);
            setSum(VAT_AMOUNT, grandTotals.vatAmount);
            setSum(FINAL_TOTAL, grandTotals.finalTotal);
            if (ctx.canSeeMargin) {
                setSum(BUY_TOTAL, grandTotals.buyTotal);
                setSum(MARGIN_AMOUNT, grandTotals.marginAmount);
            }
        }
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const revenueReport: ReportDefinition = {
    key: "revenue",
    label: "Revenue Report",
    description:
        "Per-document sell-side revenue ledger across orders, service requests, self-pickups and inbound requests — live client-billable documents only (excludes internal SRs, no-cost self-pickups, not-applicable orders/inbound, and dead/cancelled docs). One row per document with its sell-side pricing snapshot — subtotal, VAT, final total — plus buy total and margin when margin visibility is held. Leave Company blank to run across ALL companies on the platform (grouped, with per-company subtotals + an overall total) — use a date range for all-companies runs. Use Entities to narrow to specific document types. Revenue date is created_at. ADMIN-only.",
    section: "FINANCIAL",
    audience: "ADMIN",
    operationsRoles: ["ADMIN"],
    permissions: ["analytics:view_revenue", "orders:export"],
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
            key: "entity_types",
            label: "Entities",
            type: "entity-toggle",
            required: false,
            options: ALL_ENTITIES.map((e) => ({ value: e, label: e })),
            default: ALL_ENTITIES,
        },
        { key: "team_id", label: "Team", type: "team", required: false, scope: "item" },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint:
            "narrow by date range (strongly recommended for all-companies runs), entities, team, or category",
    },
    run,
};
