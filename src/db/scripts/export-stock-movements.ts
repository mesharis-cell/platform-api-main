/**
 * Stock Movements Ledger — CLI script. Canonical implementation.
 *
 * Spec: ../../../docs/reports-canonical.md
 *
 * Cans-Mar pivoted layout: one row per movement leg, one column per family
 * (asset group). OPENING + events + closing (formula) + stock count (manual) +
 * DIFFERENCE (formula). CONSUMED rows + TOTAL rows deliberately removed for
 * the clean `Closing = Opening + ADJ − OUT + RET − WO` reconciliation.
 *
 * Post-squash: family pivot = `assets.group_id` + `assets.group_name`.
 *
 * Usage:
 *   APP_ENV=<env> bun src/db/scripts/export-stock-movements.ts -- \
 *       --company-id <uuid> \
 *       (--category <name> | --group-id <uuid>) [--group-id ...] \
 *       [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] \
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

// ─── CLI ────────────────────────────────────────────────────────────────────

const getArg = (n: string) => {
    const i = process.argv.indexOf(`--${n}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const getRepeated = (n: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < process.argv.length; i += 1) {
        if (process.argv[i] === `--${n}` && process.argv[i + 1]) out.push(process.argv[i + 1]);
    }
    return out;
};

const companyId = getArg("company-id");
const categoryName = getArg("category");
const explicitGroupIds = getRepeated("group-id");
const dateFromStr = getArg("date-from");
const dateToStr = getArg("date-to");
const outArg = getArg("out");

if (!companyId) {
    console.error(
        "Usage: APP_ENV=<env> bun src/db/scripts/export-stock-movements.ts -- \\\n" +
            "    --company-id <uuid> \\\n" +
            "    (--category <name> | --group-id <uuid>) [--group-id <uuid>] \\\n" +
            "    [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] [--out <path>]"
    );
    process.exit(2);
}
if (!categoryName && explicitGroupIds.length === 0) {
    console.error("Provide --category <name> OR one or more --group-id <uuid>.");
    process.exit(2);
}

const dateFrom = dateFromStr ? new Date(`${dateFromStr}T00:00:00.000Z`) : null;
const dateTo = dateToStr ? new Date(`${dateToStr}T23:59:59.999Z`) : null;

// ─── Helpers ────────────────────────────────────────────────────────────────

const SECTION_FILL: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFAFAFA" },
};
const HEADER_FILL: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
};
const DIFF_FILL: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF7E6" },
};
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };
const POSITIVE_FONT: Partial<ExcelJS.Font> = { color: { argb: "FF137333" } };
const NEGATIVE_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFB00020" } };

const colName = (zeroIdx: number): string => {
    let n = zeroIdx;
    let s = "";
    while (n >= 0) {
        s = String.fromCharCode((n % 26) + 65) + s;
        n = Math.floor(n / 26) - 1;
    }
    return s;
};

const fmtDDMM = (d: Date): string =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

const fmtParenDate = (s: string | null): string | null =>
    s ? `(${s.split("-").reverse().join(".")})` : null;

const legSuffix = (
    movement_type: string,
    write_off_reason: string | null,
    outbound_ad_hoc_reason: string | null
): string => {
    if (movement_type === "OUTBOUND") return "OUTBOUND";
    if (movement_type === "INBOUND") return "RETURN";
    if (movement_type === "WRITE_OFF") {
        if (write_off_reason === "LOST") return "LOST";
        if (write_off_reason === "DAMAGED") return "DAMAGED";
        return "WRITE-OFF";
    }
    if (movement_type === "OUTBOUND_AD_HOC")
        return outbound_ad_hoc_reason ? `AD-HOC OUT (${outbound_ad_hoc_reason})` : "AD-HOC OUT";
    if (movement_type === "ADJUSTMENT") return "ADJUSTMENT";
    if (movement_type === "INITIAL") return "INITIAL";
    return movement_type;
};

// ─── Main ───────────────────────────────────────────────────────────────────

type Family = { id: string; name: string; closing_qty: number; opening_qty: number | null };
type EventRow = {
    sortKey: number;
    date: string;
    requestedBy: string;
    purpose: string;
    deltas: Map<string, number>;
};

async function main() {
    // 1. Company + platform
    const co = (
        await db.execute(
            sql`SELECT id, "platform" AS platform_id, name FROM companies WHERE id = ${companyId}`
        )
    ).rows[0] as any;
    if (!co) {
        console.error(`Company not found: ${companyId}`);
        process.exit(2);
    }
    const platformId = co.platform_id as string;
    const companyName = co.name as string;

    // 2. Resolve families (groups). Post-squash: distinct (group_id, group_name)
    //    from assets in scope. Scope = company + (category OR explicit group_ids).
    const famConds = [
        `a.company_id = '${companyId}'`,
        `a.deleted_at IS NULL`,
        `a.group_id IS NOT NULL`,
    ];
    if (categoryName)
        famConds.push(`LOWER(a.category) = LOWER('${categoryName.replace(/'/g, "''")}')`);
    if (explicitGroupIds.length > 0) {
        const list = explicitGroupIds.map((g) => `'${g}'`).join(",");
        famConds.push(`a.group_id IN (${list})`);
    }

    const famRows = (
        await db.execute(
            sql.raw(`
        SELECT
            a.group_id AS id,
            MIN(a.group_name) AS name,
            COALESCE(SUM(a.available_quantity), 0)::int AS closing_qty
        FROM assets a
        WHERE ${famConds.join(" AND ")}
        GROUP BY a.group_id
        ORDER BY MIN(a.group_name) ASC`)
        )
    ).rows as any[];

    const families: Family[] = famRows.map((r) => ({
        id: r.id,
        name: r.name ?? "(unnamed)",
        closing_qty: Number(r.closing_qty),
        opening_qty: null,
    }));

    if (families.length === 0) {
        console.error("No families matched scope. Check --company-id / --category / --group-id.");
        process.exit(2);
    }
    console.log(`[stock] ${families.length} families in scope`);

    // 3. Pull in-window movements for those families (assets.group_id link OR
    //    stock_movements.asset_family_id direct link — post-squash both exist).
    const familyIds = families.map((f) => f.id);
    const famIdList = familyIds.map((g) => `'${g}'`).join(",");
    const moveFilters: string[] = [
        `sm.platform_id = '${platformId}'`,
        `((sm.asset_family_id IN (${famIdList})) OR (a.group_id IN (${famIdList})))`,
    ];
    if (dateFrom) moveFilters.push(`sm.created_at >= '${dateFrom.toISOString()}'`);
    if (dateTo) moveFilters.push(`sm.created_at <= '${dateTo.toISOString()}'`);

    const moves = (
        await db.execute(
            sql.raw(`
        SELECT
            sm.id, sm.created_at, sm.movement_type, sm.write_off_reason, sm.outbound_ad_hoc_reason,
            sm.delta, sm.note, sm.linked_entity_type, sm.linked_entity_id,
            COALESCE(sm.asset_family_id, a.group_id) AS family_id
        FROM stock_movements sm
        LEFT JOIN assets a ON sm.asset_id = a.id
        WHERE ${moveFilters.join(" AND ")}
        ORDER BY sm.created_at DESC`)
        )
    ).rows as any[];
    console.log(
        `[stock] ${moves.length} movement rows in scope${dateFrom || dateTo ? " (window applied)" : ""}`
    );

    // 4. Resolve entity refs (orders + SPs) for nice purpose strings.
    const orderIds = new Set<string>();
    const spIds = new Set<string>();
    for (const m of moves) {
        if (!m.linked_entity_id) continue;
        if (m.linked_entity_type === "ORDER") orderIds.add(m.linked_entity_id);
        if (m.linked_entity_type === "SELF_PICKUP") spIds.add(m.linked_entity_id);
    }
    const orderInfo = new Map<string, { ref: string; venue: string; user: string | null }>();
    if (orderIds.size > 0) {
        const list = [...orderIds].map((i) => `'${i}'`).join(",");
        const r = (
            await db.execute(
                sql.raw(
                    `SELECT o.id, o.order_id AS ref, o.venue_name AS venue, u.name AS user_name
                     FROM orders o LEFT JOIN users u ON o.created_by = u.id
                     WHERE o.id IN (${list})`
                )
            )
        ).rows as any[];
        for (const x of r)
            orderInfo.set(x.id, { ref: x.ref, venue: x.venue ?? "", user: x.user_name });
    }
    const spInfo = new Map<string, { ref: string; collector: string; user: string | null }>();
    if (spIds.size > 0) {
        const list = [...spIds].map((i) => `'${i}'`).join(",");
        const r = (
            await db.execute(
                sql.raw(
                    `SELECT sp.id, sp.self_pickup_id AS ref, sp.collector_name AS collector, u.name AS user_name
                     FROM self_pickups sp LEFT JOIN users u ON sp.created_by = u.id
                     WHERE sp.id IN (${list})`
                )
            )
        ).rows as any[];
        for (const x of r)
            spInfo.set(x.id, { ref: x.ref, collector: x.collector, user: x.user_name });
    }

    // 5. Group in-window movements into legs. Drop CONSUMED entirely.
    const groups = new Map<string, EventRow>();
    for (const m of moves) {
        if (!m.family_id) continue;
        if (m.movement_type === "WRITE_OFF" && m.write_off_reason === "CONSUMED") continue;

        const legKey =
            m.movement_type === "WRITE_OFF"
                ? `${m.movement_type}:${m.write_off_reason ?? "OTHER"}`
                : m.movement_type === "OUTBOUND_AD_HOC"
                  ? `${m.movement_type}:${m.outbound_ad_hoc_reason ?? "OTHER"}`
                  : m.movement_type;
        const groupKey =
            m.linked_entity_type && m.linked_entity_id
                ? `${m.linked_entity_type}:${m.linked_entity_id}:${legKey}`
                : `MOVEMENT:${m.id}:${legKey}`;

        let g = groups.get(groupKey);
        const leg = legSuffix(m.movement_type, m.write_off_reason, m.outbound_ad_hoc_reason);
        if (!g) {
            let base = "";
            let requestedBy = "";
            if (m.linked_entity_type === "ORDER" && m.linked_entity_id) {
                const o = orderInfo.get(m.linked_entity_id);
                if (o) {
                    requestedBy = o.user ?? "";
                    base = [o.ref, o.venue].filter(Boolean).join(" — ");
                }
            } else if (m.linked_entity_type === "SELF_PICKUP" && m.linked_entity_id) {
                const sp = spInfo.get(m.linked_entity_id);
                if (sp) {
                    requestedBy = sp.user ?? "";
                    base = `${sp.ref} — Collector: ${sp.collector ?? ""}`;
                }
            }
            const purpose = base ? `${base} — ${leg}` : leg;
            const withNote = m.note ? `${purpose} — ${m.note}` : purpose;
            g = {
                sortKey: m.created_at ? new Date(m.created_at).getTime() : 0,
                date: m.created_at ? fmtDDMM(new Date(m.created_at)) : "",
                requestedBy,
                purpose: withNote,
                deltas: new Map(),
            };
            groups.set(groupKey, g);
        } else if (m.created_at) {
            const t = new Date(m.created_at).getTime();
            if (t < g.sortKey) {
                g.sortKey = t;
                g.date = fmtDDMM(new Date(m.created_at));
            }
        }
        g.deltas.set(m.family_id, (g.deltas.get(m.family_id) ?? 0) + Number(m.delta));
    }
    const events = [...groups.values()].sort((a, b) => a.sortKey - b.sortKey);
    console.log(`[stock] ${events.length} event rows (after leg grouping; CONSUMED filtered)`);

    // 6. Closing rewind — for each family, closing(dateTo) = current_available
    //    − Σ(post-cutoff non-CONSUMED warehouse-affecting deltas).
    if (dateTo) {
        const post = (
            await db.execute(
                sql.raw(`
            SELECT COALESCE(sm.asset_family_id, a.group_id) AS family_id,
                   COALESCE(SUM(sm.delta), 0)::int AS delta_sum
            FROM stock_movements sm
            LEFT JOIN assets a ON sm.asset_id = a.id
            WHERE sm.platform_id = '${platformId}'
              AND ((sm.asset_family_id IN (${famIdList})) OR (a.group_id IN (${famIdList})))
              AND sm.created_at > '${dateTo.toISOString()}'
              AND NOT (sm.movement_type::text = 'WRITE_OFF' AND sm.write_off_reason::text = 'CONSUMED')
            GROUP BY COALESCE(sm.asset_family_id, a.group_id)`)
            )
        ).rows as any[];
        const postBy = new Map<string, number>();
        for (const r of post) if (r.family_id) postBy.set(r.family_id, Number(r.delta_sum));
        for (const f of families) f.closing_qty = f.closing_qty - (postBy.get(f.id) ?? 0);
    }

    // 7. Opening: closing − Σ(in-window deltas). Whether or not dateFrom is set,
    //    we anchor opening so the closing-stock formula always works.
    for (const f of families) {
        let inWindow = 0;
        for (const e of events) inWindow += e.deltas.get(f.id) ?? 0;
        f.opening_qty = f.closing_qty - inWindow;
    }

    // 8. Render
    const wb = new ExcelJS.Workbook();
    const s = wb.addWorksheet(categoryName ?? "Stock Ledger");

    const totalCols = 3 + families.length;
    s.columns = [
        { width: 13 },
        { width: 18 },
        { width: 50 },
        ...families.map(() => ({ width: 12 })),
    ];

    // Title row
    const rangeBits: string[] = [];
    if (categoryName) rangeBits.push(categoryName);
    rangeBits.push("Stock Ledger");
    const dateLabel = (() => {
        if (dateFromStr && dateToStr)
            return `(${dateFromStr.split("-").reverse().join(".")} — ${dateToStr.split("-").reverse().join(".")})`;
        if (dateToStr) return `(through ${dateToStr.split("-").reverse().join(".")})`;
        if (dateFromStr) return `(from ${dateFromStr.split("-").reverse().join(".")})`;
        return "";
    })();
    s.addRow([`${companyName} — ${rangeBits.join(" — ")}${dateLabel ? " " + dateLabel : ""}`]);
    s.mergeCells(1, 1, 1, totalCols);
    s.getCell("A1").font = TITLE_FONT;
    s.getRow(1).height = 24;

    // Header row
    const hdr = s.addRow([
        "Date",
        "Requested By",
        "Purpose & Details",
        ...families.map((f) => f.name),
    ]);
    hdr.font = { bold: true };
    hdr.fill = HEADER_FILL;
    hdr.alignment = { horizontal: "left", vertical: "middle" };
    hdr.height = 30;

    // Opening row
    const openingLabel = dateFromStr
        ? `opening stock ${fmtParenDate(dateFromStr)}`
        : "OPENING STOCK";
    const openingRow = s.addRow([
        "",
        "",
        openingLabel,
        ...families.map((f) => (f.opening_qty == null ? "" : f.opening_qty)),
    ]);
    openingRow.font = { bold: true };
    openingRow.fill = SECTION_FILL;
    const openingRowNum = openingRow.number;

    // Event rows
    let firstEvent: number | null = null,
        lastEvent = 0;
    for (const e of events) {
        const cells: any[] = [e.date, e.requestedBy, e.purpose];
        for (const f of families) cells.push(e.deltas.get(f.id) ?? "");
        const row = s.addRow(cells);
        for (let i = 0; i < families.length; i += 1) {
            const c = row.getCell(4 + i);
            if (typeof c.value === "number") {
                c.font = c.value > 0 ? POSITIVE_FONT : c.value < 0 ? NEGATIVE_FONT : {};
            }
        }
        if (firstEvent === null) firstEvent = row.number;
        lastEvent = row.number;
    }

    // Closing row — formula =opening + SUM(events) per family column
    const closingLabel = dateToStr ? `closing stock ${fmtParenDate(dateToStr)}` : "closing stock";
    const closingCells: any[] = ["", "", closingLabel];
    for (let i = 0; i < families.length; i += 1) {
        const letter = colName(3 + i);
        const f = families[i];
        if (firstEvent !== null && lastEvent > 0) {
            closingCells.push({
                formula: `${letter}${openingRowNum}+SUM(${letter}${firstEvent}:${letter}${lastEvent})`,
                result: f.closing_qty,
            });
        } else {
            closingCells.push(f.closing_qty);
        }
    }
    const closingRow = s.addRow(closingCells);
    closingRow.font = { bold: true };
    closingRow.fill = SECTION_FILL;

    // Stock count row (manual)
    const today = new Date();
    const countRow = s.addRow([
        "",
        "",
        `stock count on the ${fmtDDMM(today)}`,
        ...families.map(() => ""),
    ]);
    countRow.font = { italic: true };

    // DIFFERENCE row — formula
    const diffCells: any[] = ["", "", "DIFFERENCE"];
    for (let i = 0; i < families.length; i += 1) {
        const letter = colName(3 + i);
        diffCells.push({
            formula: `IF(${letter}${countRow.number}="","",${letter}${countRow.number}-${letter}${closingRow.number})`,
        });
    }
    const diffRow = s.addRow(diffCells);
    diffRow.font = { bold: true };
    diffRow.fill = DIFF_FILL;

    // Freeze title + header + first 3 cols
    s.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];

    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

    const safe = (x: string) => x.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
    const datestamp = new Date().toISOString().slice(0, 10);
    const scopeLabel = categoryName
        ? safe(categoryName.toLowerCase())
        : `${families.length}-groups`;
    const defaultName = `${safe(companyName.toLowerCase())}-${scopeLabel}-stock-ledger-${datestamp}.xlsx`;
    const outPath = outArg ?? path.join(process.cwd(), defaultName);
    fs.writeFileSync(outPath, buf);
    console.log(`[stock] wrote ${outPath} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
}

main()
    .then(async () => {
        await pool.end();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error("[stock] failed:", err);
        try {
            await pool.end();
        } catch {
            /* pool already closed — ignore */
        }
        process.exit(1);
    });
