/**
 * Shared XLSX toolkit for the reports system — the single source of "house
 * style" so every report feels like one product, and the choke point for the
 * cross-cutting decisions (timezone date-bounds, money format, as-of stamping,
 * empty-state). See docs/reports-system-direction.md §2A.3 + §3.3.
 *
 * Nothing tenant-specific lives here. Reports build their workbook through
 * createReportWorkbook() + the row helpers, then the runner
 * (reports.controllers.ts) streams or buffers it.
 */
import { Response } from "express";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "../../db";
import CustomizedError from "../error/customized-error";
import httpStatus from "http-status";

// ─── House style — ONE frozen palette (reconciled from the two CLI scripts) ──

export const STYLE = {
    TITLE_FONT: { bold: true, size: 14 } as Partial<ExcelJS.Font>,
    SUBTITLE_FONT: { italic: true, size: 10, color: { argb: "FF6B6B6B" } } as Partial<ExcelJS.Font>,
    HEADER_FILL: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
    } as ExcelJS.Fill,
    SUBTOTAL_FILL: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F2F2" },
    } as ExcelJS.Fill,
    GRAND_FILL: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFE9A8" },
    } as ExcelJS.Fill,
    SECTION_FILL: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFAFAFA" },
    } as ExcelJS.Fill,
    DIFF_FILL: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E6" } } as ExcelJS.Fill,
    POSITIVE_FONT: { color: { argb: "FF137333" } } as Partial<ExcelJS.Font>,
    NEGATIVE_FONT: { color: { argb: "FFB00020" } } as Partial<ExcelJS.Font>,
} as const;

/** OUTCOME cell colouring — RETURNED/PARTIAL/CONSUMED/OUT. Used by issuance,
 *  inbound-log, overdue-returns, current-stock low-stock flag. */
export const OUTCOME_FILL: Record<string, string> = {
    RETURNED: "FFE8F5E9",
    PARTIAL: "FFFFF9C4",
    CONSUMED: "FFFFE0B2",
    OUT: "FFFFCDD2",
    OVERDUE: "FFFFCDD2",
};
export const OUTCOME_FONT: Record<string, string> = {
    RETURNED: "FF1B5E20",
    PARTIAL: "FFF57F17",
    CONSUMED: "FFE65100",
    OUT: "FFB71C1C",
    OVERDUE: "FFB71C1C",
};

/** AED money number format — frozen so every money column reads identically. */
export const MONEY_FMT = "#,##0.00";
export const INT_FMT = "#,##0";

// ─── STATUS cell colouring — tiered across the 4 entity status enums ─────────
// One palette mapping EVERY status value (order / self-pickup / service-request
// operational + commercial / inbound) into five lifecycle tiers, so a status
// column reads the same in any report. Tiers:
//   Tentative — pre-commitment, may still fall through (amber)
//   Committed — agreed, not yet moving (blue)
//   In-flight — physically in motion / on-site (cyan)
//   Completed — closed out / done (green)
//   Dead      — never-happened / killed (grey)
// Unknown values fall back to a neutral (no fill, default font).

type StatusTier = "TENTATIVE" | "COMMITTED" | "IN_FLIGHT" | "COMPLETED" | "DEAD";

const STATUS_TIER_FILL: Record<StatusTier, string> = {
    TENTATIVE: "FFFFF8E1",
    COMMITTED: "FFE3F2FD",
    IN_FLIGHT: "FFE0F7FA",
    COMPLETED: "FFE8F5E9",
    DEAD: "FFF5F5F5",
};
const STATUS_TIER_FONT: Record<StatusTier, string> = {
    TENTATIVE: "FFB7791F",
    COMMITTED: "FF0D47A1",
    IN_FLIGHT: "FF006064",
    COMPLETED: "FF1B5E20",
    DEAD: "FF9E9E9E",
};

/** status value → lifecycle tier. Covers all four entity enums. */
const STATUS_TIER: Record<string, StatusTier> = {
    // Tentative — order: SUBMITTED/PRICING_REVIEW/PENDING_APPROVAL/QUOTED;
    // SP equivalents; SR submitted/in-review; commercial pending/quoted.
    SUBMITTED: "TENTATIVE",
    PRICING_REVIEW: "TENTATIVE",
    PENDING_APPROVAL: "TENTATIVE",
    QUOTED: "TENTATIVE",
    IN_REVIEW: "TENTATIVE",
    PENDING_QUOTE: "TENTATIVE",
    QUOTE_SENT: "TENTATIVE",
    QUOTE_REVISED: "TENTATIVE",

    // Committed — agreed, not yet physically moving.
    CONFIRMED: "COMMITTED",
    IN_PREPARATION: "COMMITTED",
    APPROVED: "COMMITTED",
    QUOTE_ACCEPTED: "COMMITTED",
    QUOTE_APPROVED: "COMMITTED",
    PENDING_INVOICE: "COMMITTED",

    // In-flight — physically in motion / on-site / out with the client.
    READY_FOR_DELIVERY: "IN_FLIGHT",
    IN_TRANSIT: "IN_FLIGHT",
    DELIVERED: "IN_FLIGHT",
    IN_USE: "IN_FLIGHT",
    DERIG: "IN_FLIGHT",
    AWAITING_RETURN: "IN_FLIGHT",
    RETURN_IN_TRANSIT: "IN_FLIGHT",
    READY_FOR_PICKUP: "IN_FLIGHT",
    PICKED_UP: "IN_FLIGHT",
    IN_PROGRESS: "IN_FLIGHT",
    INVOICED: "IN_FLIGHT",

    // Completed — closed out / done / paid.
    CLOSED: "COMPLETED",
    COMPLETED: "COMPLETED",
    PAID: "COMPLETED",

    // Dead — never-happened / killed / not-applicable.
    DRAFT: "DEAD",
    DECLINED: "DEAD",
    CANCELLED: "DEAD",
    INTERNAL: "DEAD",
    NOT_APPLICABLE: "DEAD",
};

/** Resolve a status string to its { fill, font } cell style. Unknown values get
 *  a neutral style (no fill, default font). Follows the STYLE.*_FILL pattern. */
export function statusCellStyle(status: string): {
    fill?: ExcelJS.Fill;
    font?: Partial<ExcelJS.Font>;
} {
    const tier = STATUS_TIER[String(status ?? "").toUpperCase()];
    if (!tier) return {};
    return {
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_TIER_FILL[tier] } },
        font: { bold: true, color: { argb: STATUS_TIER_FONT[tier] } },
    };
}

/** Apply the tiered status style to a cell in place (mirrors colourOutcome). */
export function colourStatus(cell: ExcelJS.Cell, status: string): void {
    const { fill, font } = statusCellStyle(status);
    if (fill) cell.fill = fill;
    if (font) cell.font = font;
}

// ─── Timezone / date bounds — ONE answer for all 12 reports ──────────────────
// Platform feasibility TZ is Asia/Dubai (UTC+4, no DST). date_to expands to
// start-of-next-day so a same-day row at any hour is included (use lt, not lte).

const DUBAI_OFFSET = "+04:00";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateBounds {
    gte: Date | null;
    lt: Date | null;
}

/** Resolve optional YYYY-MM-DD strings to half-open UTC instants on Dubai days. */
export function fmtDateBounds(from?: string | null, to?: string | null): DateBounds {
    const gte = from ? new Date(`${from}T00:00:00${DUBAI_OFFSET}`) : null;
    const lt = to ? new Date(new Date(`${to}T00:00:00${DUBAI_OFFSET}`).getTime() + DAY_MS) : null;
    if (gte && isNaN(gte.getTime()))
        throw new CustomizedError(httpStatus.BAD_REQUEST, `Invalid date_from: ${from}`);
    if (lt && isNaN(lt.getTime()))
        throw new CustomizedError(httpStatus.BAD_REQUEST, `Invalid date_to: ${to}`);
    if (gte && lt && gte.getTime() >= lt.getTime())
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "date_from must be on or before date_to."
        );
    return { gte, lt };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

/** DD.MM.YYYY in Asia/Dubai. Accepts Date | ISO string | null. */
export function fmtDate(value: Date | string | null | undefined): string {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("day")}.${get("month")}.${get("year")}`;
}

/** Title-bar range label from the raw YYYY-MM-DD strings. */
export function fmtRangeLabel(from?: string | null, to?: string | null): string {
    const dot = (s: string) => s.split("-").reverse().join(".");
    if (from && to) return `(${dot(from)} — ${dot(to)})`;
    if (to) return `(through ${dot(to)})`;
    if (from) return `(from ${dot(from)})`;
    return "(all time)";
}

/** "as of DD.MM.YYYY HH:MM GST" — for snapshot (no-date-axis) reports. */
export function asOfLabel(now: Date): string {
    const f = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(now);
    const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
    return `as of ${g("day")}.${g("month")}.${g("year")} ${g("hour")}:${g("minute")} GST`;
}

/** decimal-from-PG (string) → number; safe for arithmetic. */
export function parseNum(v: unknown): number {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isNaN(n) ? 0 : n;
}

/** Round to cents (avoids float drift on grand totals). */
export function roundMoney(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Excel column letter, multi-letter (A…Z, AA…ZZ). 0-based. */
export function colLetter(zeroIdx: number): string {
    let n = zeroIdx;
    let s = "";
    while (n >= 0) {
        s = String.fromCharCode((n % 26) + 65) + s;
        n = Math.floor(n / 26) - 1;
    }
    return s;
}

// ─── Excel formula string builders ───────────────────────────────────────────
// Pure string builders so a compounded cell can hold a LIVE formula (set as
// `cell.value = { formula: sumRange(...), result: cached }`). They do NOT write
// to ExcelJS — the caller owns the cell. `col` is the 1-based column letter
// (e.g. "C") to match how callers already have colLetter() output in hand.

/** "SUM(C5:C10)" — contiguous range down one column. */
export function sumRange(col: string, firstRow: number, lastRow: number): string {
    return `SUM(${col}${firstRow}:${col}${lastRow})`;
}

/** "SUM(C5,C8,C11)" — explicit (non-contiguous) cells in one column. */
export function sumCells(col: string, rowNums: number[]): string {
    return `SUM(${rowNums.map((r) => `${col}${r}`).join(",")})`;
}

/** "C5*0.15" — a cell times a flat rate (e.g. a VAT/markup line). */
export function cellTimesRate(col: string, row: number, rate: number): string {
    return `${col}${row}*${rate}`;
}

/** "C5+D5" — two cells added (e.g. subtotal + VAT → total). */
export function addCells(colA: string, rowA: number, colB: string, rowB: number): string {
    return `${colA}${rowA}+${colB}${rowB}`;
}

// ─── Company context — the "platform AS platform_id" alias trap, solved once ─

export interface CompanyContext {
    platformId: string;
    companyName: string;
}

/** companies.platform_id is the PG column "platform"; companies.id is the FK. */
export async function resolveCompanyContext(companyId: string): Promise<CompanyContext> {
    const row = (
        await db.execute(
            sql`SELECT id, "platform" AS platform_id, name FROM companies WHERE id = ${companyId}`
        )
    ).rows[0] as { platform_id: string; name: string } | undefined;
    if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, `Company not found: ${companyId}`);
    return { platformId: row.platform_id, companyName: row.name };
}

// ─── Workbook scaffold ───────────────────────────────────────────────────────

export type ColAlign = "left" | "right" | "center";

export interface ReportColumn {
    header: string; // UPPERCASE
    width?: number;
    align?: ColAlign;
    /** number format applied to the column's data cells (e.g. MONEY_FMT). */
    numFmt?: string;
}

export interface WorkbookHandle {
    wb: ExcelJS.Workbook;
    sheet: ExcelJS.Worksheet;
    /** 1-based row index of the (frozen) header row. Data starts at +1. */
    headerRow: number;
}

export interface CreateWorkbookOpts {
    companyName: string;
    label: string;
    /** subtitle line under the title — pass fmtRangeLabel(...) or asOfLabel(...). */
    subtitle: string;
    columns: ReportColumn[];
    sheetName?: string;
}

/** Build a styled workbook with a merged title row, a subtitle row, and a
 *  frozen UPPERCASE header. Returns the sheet + the header row index. */
export function createReportWorkbook(opts: CreateWorkbookOpts): WorkbookHandle {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Kadence";
    const sheet = wb.addWorksheet(opts.sheetName ?? opts.label.slice(0, 28));
    const n = opts.columns.length;

    sheet.columns = opts.columns.map((c) => ({ width: c.width ?? 16 }));

    // Title
    sheet.mergeCells(1, 1, 1, n);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `${opts.companyName} — ${opts.label}`;
    titleCell.font = STYLE.TITLE_FONT;
    sheet.getRow(1).height = 22;

    // Subtitle (range / as-of)
    sheet.mergeCells(2, 1, 2, n);
    const subCell = sheet.getCell(2, 1);
    subCell.value = opts.subtitle;
    subCell.font = STYLE.SUBTITLE_FONT;

    // Header
    const header = sheet.getRow(3);
    opts.columns.forEach((c, i) => {
        const cell = header.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true };
        cell.fill = STYLE.HEADER_FILL;
        cell.alignment = { horizontal: c.align ?? "left", vertical: "middle", wrapText: false };
    });
    header.height = 20;

    // Per-column number format on data cells: applied as rows are added by the
    // caller is fiddly, so we stash the formats and apply in finalize().
    (sheet as any).__colFmts = opts.columns.map((c) => c.numFmt ?? null);

    sheet.views = [{ state: "frozen", ySplit: 3 }];
    return { wb, sheet, headerRow: 3 };
}

/** Apply column number formats + an empty-state note if no data rows. Call once
 *  after all rows are added, before streaming. */
export function finalizeWorkbook(h: WorkbookHandle, dataRowCount: number): void {
    const fmts: (string | null)[] = (h.sheet as any).__colFmts ?? [];
    if (dataRowCount > 0) {
        fmts.forEach((fmt, i) => {
            if (!fmt) return;
            const col = h.sheet.getColumn(i + 1);
            col.eachCell({ includeEmpty: false }, (cell, rowNum) => {
                if (rowNum > h.headerRow && typeof cell.value === "number") cell.numFmt = fmt;
            });
        });
    } else {
        const note = h.sheet.getRow(h.headerRow + 1);
        note.getCell(1).value = "No data for these filters.";
        note.getCell(1).font = { italic: true, color: { argb: "FF6B6B6B" } };
    }
}

// ─── Row helpers ─────────────────────────────────────────────────────────────

/** Bold light-gray subtotal row. labelColIdx/sumColIdxs are 1-based. */
export function addSubtotalRow(
    sheet: ExcelJS.Worksheet,
    opts: {
        label: string;
        labelCol: number;
        sums: { col: number; from: number; to: number; cached: number }[];
    }
): ExcelJS.Row {
    const row = sheet.addRow([]);
    row.getCell(opts.labelCol).value = opts.label;
    row.font = { bold: true };
    row.eachCell({ includeEmpty: true }, (c) => (c.fill = STYLE.SUBTOTAL_FILL));
    for (const s of opts.sums) {
        const L = colLetter(s.col - 1);
        row.getCell(s.col).value = {
            formula: `SUM(${L}${s.from}:${L}${s.to})`,
            result: roundMoney(s.cached),
        };
    }
    return row;
}

/** Amber bold grand-total row summing the per-group subtotal cells. */
export function addGrandTotalRow(
    sheet: ExcelJS.Worksheet,
    opts: {
        label: string;
        labelCol: number;
        sums: { col: number; subtotalRows: number[]; cached: number }[];
    }
): ExcelJS.Row {
    const row = sheet.addRow([]);
    row.getCell(opts.labelCol).value = opts.label;
    row.font = { bold: true, size: 12 };
    row.eachCell({ includeEmpty: true }, (c) => (c.fill = STYLE.GRAND_FILL));
    row.height = 20;
    for (const s of opts.sums) {
        const L = colLetter(s.col - 1);
        const refs = s.subtotalRows.map((r) => `${L}${r}`).join(",");
        row.getCell(s.col).value = {
            formula: refs ? `SUM(${refs})` : "0",
            result: roundMoney(s.cached),
        };
    }
    return row;
}

/** Colour a numeric delta cell green/red (for pivots / movement ledgers). */
export function colourDelta(cell: ExcelJS.Cell): void {
    if (typeof cell.value === "number") {
        if (cell.value > 0) cell.font = STYLE.POSITIVE_FONT;
        else if (cell.value < 0) cell.font = STYLE.NEGATIVE_FONT;
    }
}

/** Colour an OUTCOME cell from the shared maps. */
export function colourOutcome(cell: ExcelJS.Cell, outcome: string): void {
    const fill = OUTCOME_FILL[outcome];
    const font = OUTCOME_FONT[outcome];
    if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    if (font) cell.font = { bold: true, color: { argb: font } };
}

// ─── Output ──────────────────────────────────────────────────────────────────

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function reportFilename(companyName: string, key: string, now: Date): string {
    const safe = (s: string) => s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
    const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(now); // YYYY-MM-DD
    return `${safe(companyName.toLowerCase())}-${key}-${stamp}.xlsx`;
}

/**
 * Send the workbook on the HTTP response. Small workbooks buffer; large ones
 * (rowCount over the streaming threshold) stream via ExcelJS's writer to keep
 * the t2.micro off the heap ceiling. The global no-store/Vary headers are set
 * by app.ts before the handler runs — we only add Content-Type/Disposition.
 */
const STREAM_THRESHOLD = 8000;

export async function sendWorkbook(
    res: Response,
    wb: ExcelJS.Workbook,
    filename: string,
    rowCount: number
): Promise<void> {
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (rowCount >= STREAM_THRESHOLD) {
        await wb.xlsx.write(res);
        res.end();
    } else {
        const buf = await wb.xlsx.writeBuffer();
        res.send(Buffer.from(buf as ArrayBuffer));
    }
}
