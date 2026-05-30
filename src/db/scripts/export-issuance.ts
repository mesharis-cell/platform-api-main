/**
 * Issuance Log Export — CLI script. Canonical implementation.
 *
 * Spec: ../../../docs/reports-canonical.md
 *
 * Produces a single-tab XLSX issuance log grouped per order / SP, with
 * subtotals + grand total, OUTCOME color-coding, the PERMANENT flag, and
 * COMMENTS (collector name for SPs). Multi-tenant: takes --company-id.
 * Category filter is generic (--exclude-category / --include-category), not
 * tenant-specific.
 *
 * Usage:
 *   APP_ENV=<env> bun src/db/scripts/export-issuance.ts -- \
 *       --company-id <uuid> \
 *       [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] \
 *       [--exclude-category <name>] (repeatable) \
 *       [--include-category <name>] (repeatable; mutually exclusive) \
 *       [--out <path>]
 */

import "../../bootstrap/env";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { assertAppEnv } from "../safety/guards";
import { db, pool } from "../../db";

assertAppEnv(["staging", "production", "testing"]);

// ─── CLI parsing ────────────────────────────────────────────────────────────

const getArg = (name: string): string | undefined => {
    const idx = process.argv.indexOf(`--${name}`);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
};

const getRepeatedArgs = (name: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < process.argv.length; i += 1) {
        if (process.argv[i] === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
    }
    return out;
};

const PLATFORM_ID = process.env.PLATFORM_ID; // optional override; default below
const companyId = getArg("company-id");
const dateFromStr = getArg("date-from");
const dateToStr = getArg("date-to");
const excludeCategories = getRepeatedArgs("exclude-category");
const includeCategories = getRepeatedArgs("include-category");
const outArg = getArg("out");

if (!companyId) {
    console.error(
        "Usage: APP_ENV=<env> bun src/db/scripts/export-issuance.ts -- \\\n" +
            "    --company-id <uuid> \\\n" +
            "    [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] \\\n" +
            "    [--exclude-category <name>] (repeatable) \\\n" +
            "    [--include-category <name>] (repeatable; mutually exclusive with --exclude-category) \\\n" +
            "    [--out <path>]"
    );
    process.exit(2);
}

if (excludeCategories.length > 0 && includeCategories.length > 0) {
    console.error("--exclude-category and --include-category are mutually exclusive.");
    process.exit(2);
}

const dateFrom = dateFromStr ? new Date(`${dateFromStr}T00:00:00.000Z`) : null;
const dateTo = dateToStr ? new Date(`${dateToStr}T23:59:59.999Z`) : null;
if (dateFromStr && isNaN(dateFrom!.getTime())) {
    console.error(`Invalid --date-from: ${dateFromStr}`);
    process.exit(2);
}
if (dateToStr && isNaN(dateTo!.getTime())) {
    console.error(`Invalid --date-to: ${dateToStr}`);
    process.exit(2);
}

// ─── Look up platform + company (the platform_id we live under) ─────────────

async function resolveContext(): Promise<{ platformId: string; companyName: string }> {
    const co = (
        await db.execute(
            sql`SELECT id, "platform" AS platform_id, name FROM companies WHERE id = ${companyId}`
        )
    ).rows[0] as any;
    if (!co) {
        console.error(`Company not found: ${companyId}`);
        process.exit(2);
    }
    const platformId = PLATFORM_ID ?? co.platform_id;
    return { platformId, companyName: co.name };
}

// ─── Query ──────────────────────────────────────────────────────────────────

function buildQuery(platformId: string): string {
    // Category clause — at most one side will be present per CLI rules.
    const exclLower = excludeCategories.map((c) => c.toLowerCase());
    const inclLower = includeCategories.map((c) => c.toLowerCase());
    const catClause = (() => {
        if (exclLower.length > 0) {
            const list = exclLower.map((c) => `'${c.replace(/'/g, "''")}'`).join(",");
            return `AND LOWER(COALESCE(a.category, '')) NOT IN (${list})`;
        }
        if (inclLower.length > 0) {
            const list = inclLower.map((c) => `'${c.replace(/'/g, "''")}'`).join(",");
            return `AND LOWER(COALESCE(a.category, '')) IN (${list})`;
        }
        return "";
    })();

    const dateClauseOrder = (() => {
        if (!dateFrom && !dateTo) return "";
        const parts: string[] = [];
        if (dateFrom)
            parts.push(`AND COALESCE(ooa.issued_at, o.created_at) >= '${dateFrom.toISOString()}'`);
        if (dateTo)
            parts.push(`AND COALESCE(ooa.issued_at, o.created_at) <= '${dateTo.toISOString()}'`);
        return parts.join("\n  ");
    })();

    const dateClauseSp = (() => {
        if (!dateFrom && !dateTo) return "";
        const parts: string[] = [];
        if (dateFrom)
            parts.push(`AND COALESCE(spo.issued_at, sp.created_at) >= '${dateFrom.toISOString()}'`);
        if (dateTo)
            parts.push(`AND COALESCE(spo.issued_at, sp.created_at) <= '${dateTo.toISOString()}'`);
        return parts.join("\n  ");
    })();

    return `
WITH
order_returns AS (
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
WHERE o.platform_id = '${platformId}' AND o.company = '${companyId}'
  AND o.order_status IN ('READY_FOR_DELIVERY','IN_TRANSIT','DELIVERED','IN_USE','DERIG','AWAITING_RETURN','RETURN_IN_TRANSIT','CLOSED')
  ${catClause}
  ${dateClauseOrder}

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
    CASE WHEN spi.skipped THEN 0
         WHEN spi.scanned_quantity IS NULL THEN spi.quantity
         ELSE spi.scanned_quantity END AS delivered_qty,
    COALESCE(spret.returned_qty, 0) AS returned_qty,
    CASE
        WHEN spi.skipped THEN 'OUT'
        WHEN (CASE WHEN spi.scanned_quantity IS NULL THEN spi.quantity ELSE spi.scanned_quantity END) = 0 THEN 'OUT'
        WHEN COALESCE(spret.returned_qty,0) >= (CASE WHEN spi.scanned_quantity IS NULL THEN spi.quantity ELSE spi.scanned_quantity END) THEN 'RETURNED'
        WHEN COALESCE(spret.returned_qty,0) > 0 THEN 'PARTIAL'
        WHEN COALESCE(spcon.consumed_qty,0) > 0 THEN 'CONSUMED'
        ELSE 'OUT' END AS outcome,
    CASE WHEN sp.collector_name IS NOT NULL AND sp.collector_name != ''
         THEN 'Collector: ' || sp.collector_name ELSE '' END AS comments
FROM self_pickups sp
JOIN self_pickup_items spi ON spi.self_pickup_id = sp.id
LEFT JOIN users u ON sp.created_by = u.id
LEFT JOIN assets a ON spi.asset_id = a.id
LEFT JOIN legacy_asset_families af ON a.group_id = af.id
LEFT JOIN teams t ON a.team_id = t.id
LEFT JOIN sp_returns spret ON spret.asset_id = spi.asset_id AND spret.self_pickup_id = sp.id
LEFT JOIN sp_consumed spcon ON spcon.asset_id = spi.asset_id AND spcon.sp_id = sp.id
LEFT JOIN sp_outbound_at spo ON spo.self_pickup_id = sp.id
WHERE sp.platform_id = '${platformId}' AND sp.company_id = '${companyId}'
  AND sp.self_pickup_status IN ('PICKED_UP','AWAITING_RETURN','CLOSED') AND NOT spi.skipped
  ${catClause}
  ${dateClauseSp}

ORDER BY doc_date ASC;
`;
}

// ─── Render ─────────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
};
const SUBTOTAL_FILL: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF2F2F2" },
};
const GRAND_FILL: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFE9A8" },
};
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };

const OUTCOME_FILL: Record<string, string> = {
    RETURNED: "FFE8F5E9",
    PARTIAL: "FFFFF9C4",
    CONSUMED: "FFFFE0B2",
    OUT: "FFFFCDD2",
};
const OUTCOME_FONT: Record<string, string> = {
    RETURNED: "FF1B5E20",
    PARTIAL: "FFF57F17",
    CONSUMED: "FFE65100",
    OUT: "FFB71C1C",
};

const fmtDate = (v: any): string => {
    if (!v) return "";
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};
const colLetter = (i: number) => String.fromCharCode(64 + i);

function buildRangeLabel(): string {
    const today = fmtDate(new Date());
    if (dateFromStr && dateToStr)
        return `(${dateFromStr.split("-").reverse().join(".")} — ${dateToStr.split("-").reverse().join(".")})`;
    if (dateToStr) return `(through ${dateToStr.split("-").reverse().join(".")})`;
    if (dateFromStr)
        return `(from ${dateFromStr.split("-").reverse().join(".")}, through ${today})`;
    return `(through ${today})`;
}

async function render(rows: any[], companyName: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet("Issuance");
    const COLS = [
        { h: "DATE", w: 13 },
        { h: "TYPE", w: 13 },
        { h: "KADENCE REFERENCE", w: 20 },
        { h: "VENUE", w: 28 },
        { h: "CITY", w: 13 },
        { h: "USER", w: 20 },
        { h: "PERMANENT", w: 11 },
        { h: `${companyName.toUpperCase()} ITEM CODE`, w: 22 },
        { h: "ITEM DESCRIPTION", w: 44 },
        { h: "TEAM", w: 18 },
        { h: "QUANTITY", w: 11 },
        { h: "OUTCOME", w: 12 },
        { h: "RETURNED QTY", w: 13 },
        { h: "COMMENTS", w: 28 },
    ];
    s.columns = COLS.map((c) => ({ width: c.w }));
    const QTY_COL = colLetter(11),
        RET_COL = colLetter(13);

    s.insertRow(1, [`${companyName} — Issuance Log ${buildRangeLabel()}`]);
    s.mergeCells(1, 1, 1, COLS.length);
    s.getCell("A1").font = TITLE_FONT;
    s.getRow(1).height = 24;
    const hdr = s.insertRow(
        2,
        COLS.map((c) => c.h)
    );
    hdr.font = { bold: true };
    hdr.fill = HEADER_FILL;
    hdr.height = 22;
    hdr.alignment = { horizontal: "left", vertical: "middle" };

    // Group by reference, preserving doc_date order from the SQL.
    const groups = new Map<string, any[]>();
    for (const r of rows) {
        if (!groups.has(r.reference)) groups.set(r.reference, []);
        groups.get(r.reference)!.push(r);
    }

    const subRowNums: number[] = [];
    for (const [ref, gr] of groups) {
        let first: number | null = null,
            last = 0;
        for (const r of gr) {
            const row = s.addRow([
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
            const oc = row.getCell(12);
            const fill = OUTCOME_FILL[r.outcome];
            const font = OUTCOME_FONT[r.outcome];
            if (fill) oc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
            if (font) oc.font = { bold: true, color: { argb: font } };
            if (first === null) first = row.number;
            last = row.number;
        }
        const sub = s.addRow([
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            `Subtotal — ${ref}`,
            "",
            null,
            "",
            null,
            "",
        ]);
        sub.font = { bold: true };
        sub.fill = SUBTOTAL_FILL;
        sub.getCell(11).value = {
            formula: `SUM(${QTY_COL}${first}:${QTY_COL}${last})`,
            result: gr.reduce((n, r) => n + (Number(r.delivered_qty) || 0), 0),
        };
        sub.getCell(13).value = {
            formula: `SUM(${RET_COL}${first}:${RET_COL}${last})`,
            result: gr.reduce((n, r) => n + (Number(r.returned_qty) || 0), 0),
        };
        subRowNums.push(sub.number);
        s.addRow([]);
    }

    const grand = s.addRow([
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        `GRAND TOTAL — ${companyName}`,
        "",
        null,
        "",
        null,
        "",
    ]);
    grand.font = { bold: true, size: 12 };
    grand.fill = GRAND_FILL;
    grand.height = 22;
    if (subRowNums.length) {
        grand.getCell(11).value = {
            formula: `SUM(${subRowNums.map((r) => QTY_COL + r).join(",")})`,
            result: rows.reduce((n, r) => n + (Number(r.delivered_qty) || 0), 0),
        };
        grand.getCell(13).value = {
            formula: `SUM(${subRowNums.map((r) => RET_COL + r).join(",")})`,
            result: rows.reduce((n, r) => n + (Number(r.returned_qty) || 0), 0),
        };
    }
    s.views = [{ state: "frozen", ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    const { platformId, companyName } = await resolveContext();
    console.log(
        `[issuance] company=${companyName} platform=${platformId.slice(0, 8)}…` +
            (dateFromStr ? ` from=${dateFromStr}` : "") +
            (dateToStr ? ` to=${dateToStr}` : "") +
            (excludeCategories.length ? ` exclude=${excludeCategories.join(",")}` : "") +
            (includeCategories.length ? ` include=${includeCategories.join(",")}` : "")
    );

    const rows = ((await db.execute(sql.raw(buildQuery(platformId)))) as any).rows as any[];
    console.log(`[issuance] ${rows.length} item rows`);
    if (rows.length === 0) {
        console.warn("[issuance] no rows — check filters / company.");
    }

    const buf = await render(rows, companyName);

    const safe = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
    const datestamp = new Date().toISOString().slice(0, 10);
    const defaultName = `${safe(companyName.toLowerCase())}-issuance-${datestamp}.xlsx`;
    const outPath = outArg ?? path.join(process.cwd(), defaultName);
    fs.writeFileSync(outPath, buf);
    console.log(`[issuance] wrote ${outPath} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
}

main()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error("[issuance] failed:", err);
        try {
            await pool.end();
        } catch {
            /* pool already closed — ignore */
        }
        process.exit(1);
    });
