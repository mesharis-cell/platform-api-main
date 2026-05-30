/**
 * Asset Catalogue (no photos) — current-state, one-row-per-asset descriptive /
 * spec inventory listing for a single tenant. Identity (asset id, name, QR),
 * group/family labels + curated category, condition/status, physical specs
 * (weight, volume, dimensions, packaging, handling tags), location, and the
 * primary image as a PLAIN-TEXT URL link. The no-photo path of the old
 * asset-catalog export (export.services.ts exportAssetCatalogService), rebuilt
 * as a canonical XLSX through the shared toolkit.
 *
 * HARD RULE (direction §7 / decision #2): no report loads images in the API,
 * ever. The with-photos catalogue stays the out-of-band CLI (export-asset-catalog.ts);
 * this report only ever renders the image URL as a text cell.
 *
 * No money columns → client-safe; ADMIN_CLIENT. There are no cost/margin/buy
 * columns to gate on ctx.canSeeMargin, and no internal-only column to drop on
 * ctx.isClientMount — this is a pure descriptive snapshot for both mounts.
 */
import { sql, SQL } from "drizzle-orm";
import httpStatus from "http-status";
import { z } from "zod";
import { db } from "../../../../db";
import CustomizedError from "../../../error/customized-error";
import { ReportDefinition, ReportResult, ReportRunContext } from "../types";
import {
    asOfLabel,
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    fmtDateBounds,
    INT_FMT,
    ReportColumn,
} from "../../../utils/report-workbook";

const ROW_CAP = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// asset_status enum (schema.ts:35-41). Param-time guard so a bad status is a
// clean 400, not a silent empty sheet.
const ASSET_STATUSES = ["AVAILABLE", "BOOKED", "OUT", "MAINTENANCE", "TRANSFORMED"] as const;

const toArr = (v: unknown): string[] =>
    v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

const paramsSchema = z
    .object({
        company_id: z.string().uuid(),
        // optional onboarding-date filter — targets assets.created_at (assets have
        // no issuance/movement date), bounded via the shared Dubai date convention.
        date_from: z.string().regex(DATE_RE).optional(),
        date_to: z.string().regex(DATE_RE).optional(),
        category_include: z.union([z.string(), z.array(z.string())]).optional(),
        category_exclude: z.union([z.string(), z.array(z.string())]).optional(),
        group_id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
        status: z.union([z.enum(ASSET_STATUSES), z.array(z.enum(ASSET_STATUSES))]).optional(),
    })
    .refine((v) => !(v.category_include && v.category_exclude), {
        message: "category_include and category_exclude are mutually exclusive",
    });

/** Generic, tenant-agnostic category filter against assets.category (alias "a").
 *  Mirrors issuance.ts categoryFilter() verbatim — silent no-op when neither set. */
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

function inListFilter(expr: SQL, values: string[]): SQL {
    if (!values.length) return sql``;
    return sql` AND ${expr} IN (${sql.join(
        values.map((v) => sql`${v}`),
        sql`, `
    )})`;
}

async function run(params: Record<string, any>, ctx: ReportRunContext): Promise<ReportResult> {
    const inc = toArr(params.category_include);
    const exc = toArr(params.category_exclude);
    const groupIds = toArr(params.group_id);
    const statuses = toArr(params.status);
    const { gte, lt } = fmtDateBounds(params.date_from, params.date_to);
    const cat = categoryFilter(inc, exc);

    // NOTE on joins (all to a PRIMARY KEY, 1:0-or-1, no fan-out → row count is
    // exactly one-per-asset; no SUM can be inflated):
    //   legacy_asset_families.id (PK) via the UNENFORCED assets.group_id = laf.id
    //     UUID correlation (no FK, migration 0061) — orphans → NULL company item
    //     code / curated category, kept via LEFT JOIN.
    //   asset_categories.id (PK) via laf.category_id — curated/normalized category.
    //   companies / brands / teams / warehouses / zones / users — all PK LEFT JOINs.
    // assets.platform_id is a real column literally named platform_id (NOT the
    //   "platform" alias trap that companies/brands/zones carry).
    const query = sql`
SELECT
    a.id AS asset_id,
    a.name AS asset_name,
    a.qr_code,
    COALESCE(a.group_name, laf.name) AS group_label,
    laf.company_item_code AS company_item_code,
    a.description,
    co.name AS company_name,
    b.name AS brand_name,
    a.category AS category,
    ac.name AS curated_category,
    t.name AS team_name,
    a.stock_mode,
    a.total_quantity,
    a.available_quantity,
    -- BOOKED+OUT (LEDGER): the stored booking-lifecycle counter (total - available),
    -- NOT an as-of asset_bookings overlap and NOT inclusive of self-bookings.
    -- Clamped >= 0 defensively (DB CHECK assets_available_le_total, migration 0053,
    -- makes a negative structurally impossible, but clamp anyway).
    GREATEST(0, a.total_quantity - a.available_quantity) AS booked_out_ledger,
    a.low_stock_threshold,
    a.condition,
    a.status,
    a.condition_notes,
    a.refurb_days_estimate,
    a.packaging,
    a.weight_per_unit,
    a.volume_per_unit,
    -- numeric-coercing dimension extract (mirror the readDim helper): a stray
    -- non-numeric JSON value renders blank, never a string in a numeric column.
    CASE WHEN jsonb_typeof(a.dimensions->'length') = 'number' THEN (a.dimensions->>'length')::numeric END AS dim_length,
    CASE WHEN jsonb_typeof(a.dimensions->'width')  = 'number' THEN (a.dimensions->>'width')::numeric  END AS dim_width,
    CASE WHEN jsonb_typeof(a.dimensions->'height') = 'number' THEN (a.dimensions->>'height')::numeric END AS dim_height,
    a.handling_tags,
    w.name AS warehouse_name,
    z.name AS zone_name,
    a.last_scanned_at,
    u.name AS last_scanned_by_name,
    a.created_at,
    -- image source priority: on_display_image > images[0].url. URL-ONLY (text link).
    COALESCE(a.on_display_image, a.images->0->>'url') AS photo_url
FROM assets a
LEFT JOIN legacy_asset_families laf ON laf.id = a.group_id
LEFT JOIN asset_categories ac ON ac.id = laf.category_id
LEFT JOIN companies co ON co.id = a.company_id
LEFT JOIN brands b ON b.id = a.brand_id
LEFT JOIN teams t ON t.id = a.team_id
LEFT JOIN warehouses w ON w.id = a.warehouse_id
LEFT JOIN zones z ON z.id = a.zone_id
LEFT JOIN users u ON u.id = a.last_scanned_by
WHERE a.platform_id = ${ctx.platformId} AND a.company_id = ${ctx.companyId}
  AND a.deleted_at IS NULL
  ${cat}
  ${inListFilter(sql.raw("a.group_id::text"), groupIds)}
  ${inListFilter(sql.raw("a.status::text"), statuses)}
  ${dateFilter(sql.raw("a.created_at"), gte, lt)}
ORDER BY COALESCE(a.group_name, laf.name) ASC NULLS LAST, a.name ASC`;

    const rows = ((await db.execute(query)) as any).rows as any[];
    if (rows.length > ROW_CAP)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Asset catalogue has ${rows.length} assets (cap ${ROW_CAP}). Narrow by category, group, status, or onboarding date.`
        );

    const codeHeader = `${ctx.companyName.toUpperCase()} ITEM CODE`;
    // No money/cost/margin columns exist in this report, so there is nothing to
    // gate on ctx.canSeeMargin and nothing internal-only to drop on ctx.isClientMount.
    const columns: ReportColumn[] = [
        { header: "ASSET ID", width: 38 },
        { header: "ASSET NAME", width: 32 },
        { header: "QR CODE", width: 22 },
        { header: "GROUP", width: 28 },
        { header: codeHeader, width: 22 },
        { header: "DESCRIPTION", width: 40 },
        { header: "COMPANY", width: 22 },
        { header: "BRAND", width: 18 },
        { header: "CATEGORY", width: 18 },
        { header: "CURATED CATEGORY", width: 18 },
        { header: "TEAM", width: 16 },
        { header: "STOCK MODE", width: 14 },
        { header: "TOTAL QTY", width: 11, align: "right", numFmt: INT_FMT },
        { header: "AVAILABLE QTY", width: 13, align: "right", numFmt: INT_FMT },
        { header: "BOOKED+OUT (LEDGER)", width: 18, align: "right", numFmt: INT_FMT },
        { header: "LOW STOCK THRESHOLD", width: 16, align: "right", numFmt: INT_FMT },
        { header: "CONDITION", width: 12 },
        { header: "STATUS", width: 14 },
        { header: "CONDITION NOTES", width: 28 },
        { header: "REFURB DAYS", width: 12, align: "right", numFmt: INT_FMT },
        { header: "PACKAGING", width: 16 },
        { header: "WEIGHT (KG)", width: 12, align: "right", numFmt: "#,##0.00" },
        { header: "VOLUME (M3)", width: 12, align: "right", numFmt: "#,##0.000" },
        { header: "LENGTH (CM)", width: 12, align: "right", numFmt: "#,##0.##" },
        { header: "WIDTH (CM)", width: 12, align: "right", numFmt: "#,##0.##" },
        { header: "HEIGHT (CM)", width: 12, align: "right", numFmt: "#,##0.##" },
        { header: "HANDLING TAGS", width: 24 },
        { header: "WAREHOUSE", width: 20 },
        { header: "ZONE", width: 16 },
        { header: "LAST SCANNED AT", width: 16 },
        { header: "LAST SCANNED BY", width: 20 },
        { header: "CREATED AT", width: 16 },
        { header: "PHOTO URL", width: 48 },
    ];

    const h = createReportWorkbook({
        companyName: ctx.companyName,
        // snapshot report — no date axis; as-of stamp. The optional date filter is
        // an onboarding (created_at) refinement, not the report's native time axis.
        subtitle: asOfLabel(ctx.now),
        label: "Asset Catalogue",
        columns,
        sheetName: "Asset Catalogue",
    });
    const sheet = h.sheet;

    const num = (v: unknown): number | null => {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "number" ? v : parseFloat(String(v));
        return Number.isFinite(n) ? n : null;
    };
    const tags = (v: unknown): string =>
        Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v);

    for (const r of rows) {
        sheet.addRow([
            r.asset_id ?? "",
            r.asset_name ?? "",
            r.qr_code ?? "",
            r.group_label ?? "",
            r.company_item_code ?? "",
            r.description ?? "",
            r.company_name ?? "",
            r.brand_name ?? "",
            r.category ?? "",
            r.curated_category ?? "",
            r.team_name ?? "",
            r.stock_mode ?? "",
            Number(r.total_quantity) || 0,
            Number(r.available_quantity) || 0,
            Number(r.booked_out_ledger) || 0,
            num(r.low_stock_threshold),
            r.condition ?? "",
            r.status ?? "",
            r.condition_notes ?? "",
            num(r.refurb_days_estimate),
            r.packaging ?? "",
            num(r.weight_per_unit),
            num(r.volume_per_unit),
            num(r.dim_length),
            num(r.dim_width),
            num(r.dim_height),
            tags(r.handling_tags),
            r.warehouse_name ?? "",
            r.zone_name ?? "",
            fmtDate(r.last_scanned_at),
            r.last_scanned_by_name ?? "",
            fmtDate(r.created_at),
            r.photo_url ?? "",
        ]);
    }

    finalizeWorkbook(h, rows.length);
    return { wb: h.wb, rowCount: rows.length };
}

export const assetCatalogueReport: ReportDefinition = {
    key: "asset-catalogue",
    label: "Asset Catalogue",
    description:
        "Current-state, one-row-per-asset descriptive inventory catalogue for a company: identity, group/family labels, curated category, condition/status, physical specs (weight, volume, dimensions, packaging, handling tags), location, and the primary image as a plain-text URL link. No photos are embedded (that path stays the CLI export); no money.",
    section: "INVENTORY",
    audience: "ADMIN_CLIENT",
    permissions: ["assets:read"],
    filters: [
        { key: "company_id", label: "Company", type: "company", required: true },
        { key: "date_from", label: "Onboarded From", type: "date", required: false },
        { key: "date_to", label: "Onboarded To", type: "date", required: false },
        {
            key: "category",
            label: "Category",
            type: "category-include-exclude",
            required: false,
            mode: "include-exclude",
            scope: "item",
        },
        { key: "group_id", label: "Group", type: "group", required: false },
        {
            key: "status",
            label: "Status",
            type: "status",
            required: false,
            options: ASSET_STATUSES.map((s) => ({ value: s, label: s })),
        },
    ],
    paramsSchema,
    rowCap: {
        max: ROW_CAP,
        dimension: "rows",
        narrowHint: "narrow by category, group, status, or onboarding date",
    },
    run,
};
