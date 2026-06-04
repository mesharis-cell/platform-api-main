/**
 * Asset-scoped stock-movements export.
 *
 * Recovers the per-asset / per-family movement ledger that the old
 * `GET /export/stock-movements` endpoint produced (deleted in commit a28e113
 * when the /export module was retired in favour of the /reports system). The
 * admin + warehouse asset-detail "Export" button still points at a per-asset
 * stock-movements export, so this re-exposes that logic at a new, asset-scoped
 * path:
 *
 *   GET /operations/v1/asset/:assetId/stock-movements/export
 *     ?movement_type=OUTBOUND        (optional filter)
 *     &from=2026-01-01               (optional ISO date — inclusive)
 *     &to=2026-03-31                 (optional ISO date — inclusive end-of-day)
 *
 * Produces an XLSX blob (house style via report-workbook.ts) of every stock
 * movement for the asset's FAMILY (group_id siblings) — date, type, qty delta,
 * reason, linked entity, plus a running balance. This is an OPERATIONAL ledger:
 * NO buy/margin columns ever.
 *
 * Mirrors the columns the old CSV produced (Movement ID, Created At, Group,
 * Asset, QR, Category, Stock Mode, Movement Type, Delta, reasons, linked
 * entity, created-by, note) and ADDS a running balance the old CSV lacked.
 */
import { Request, Response } from "express";
import httpStatus from "http-status";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../../db";
import { assets, brands, companies, stockMovements, users } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import catchAsync from "../../shared/catch-async";
import { getRequiredString } from "../../utils/request";
import {
    createReportWorkbook,
    finalizeWorkbook,
    fmtDate,
    INT_FMT,
    ReportColumn,
    reportFilename,
    sendWorkbook,
} from "../../utils/report-workbook";

/** Parse an optional ISO date (YYYY-MM-DD or full ISO). `to` expands to end-of-day. */
const parseBoundary = (raw: string | undefined, name: string, endOfDay = false): Date | null => {
    if (raw === undefined || raw === null || raw === "") return null;
    const value = endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw;
    const d = new Date(value);
    if (isNaN(d.getTime()))
        throw new CustomizedError(httpStatus.BAD_REQUEST, `Invalid ${name} date: ${raw}`);
    return d;
};

const COLUMNS: ReportColumn[] = [
    { header: "CREATED AT", width: 13 },
    { header: "MOVEMENT TYPE", width: 18 },
    { header: "DELTA", width: 10, align: "right", numFmt: INT_FMT },
    { header: "RUNNING BALANCE", width: 16, align: "right", numFmt: INT_FMT },
    { header: "REASON", width: 24 },
    { header: "LINKED ENTITY", width: 28 },
    { header: "ASSET", width: 24 },
    { header: "QR CODE", width: 16 },
    { header: "CREATED BY", width: 20 },
    { header: "NOTE", width: 40 },
    { header: "MOVEMENT ID", width: 38 },
];

const reasonFor = (
    movementType: string,
    writeOffReason: string | null,
    outboundAdHocReason: string | null
): string => {
    if (movementType === "WRITE_OFF") return writeOffReason || "WRITE-OFF";
    if (movementType === "OUTBOUND_AD_HOC") return outboundAdHocReason || "AD-HOC OUT";
    return "";
};

/**
 * GET /operations/v1/asset/:assetId/stock-movements/export
 * auth("ADMIN","LOGISTICS"); query: movement_type? from? to?
 */
const exportAssetStockMovements = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId as string;
    const assetId = getRequiredString(req.params.assetId, "assetId");
    const movementType = (req.query.movement_type as string | undefined) || undefined;
    const fromDate = parseBoundary(req.query.from as string | undefined, "from");
    const toDate = parseBoundary(req.query.to as string | undefined, "to", true);

    // Anchor asset — establishes the family scope (group_id siblings) + tenant guard.
    const [anchor] = await db
        .select({
            id: assets.id,
            name: assets.name,
            group_id: assets.group_id,
            group_name: assets.group_name,
            company_id: assets.company_id,
            company_name: companies.name,
            brand_name: brands.name,
        })
        .from(assets)
        .leftJoin(companies, eq(assets.company_id, companies.id))
        .leftJoin(brands, eq(assets.brand_id, brands.id))
        .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)))
        .limit(1);

    if (!anchor) throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");

    // Family scope: every asset sharing this group_id. A raw (ungrouped) asset
    // is its own scope of one.
    const familyAssetIds = anchor.group_id
        ? (
              await db
                  .select({ id: assets.id })
                  .from(assets)
                  .where(
                      and(eq(assets.platform_id, platformId), eq(assets.group_id, anchor.group_id))
                  )
          ).map((r) => r.id)
        : [anchor.id];

    const conditions = [
        eq(stockMovements.platform_id, platformId),
        inArray(stockMovements.asset_id, familyAssetIds),
    ];
    if (movementType) conditions.push(eq(stockMovements.movement_type, movementType as any));
    if (fromDate) conditions.push(gte(stockMovements.created_at, fromDate));
    if (toDate) conditions.push(lte(stockMovements.created_at, toDate));

    const rows = await db
        .select({
            id: stockMovements.id,
            created_at: stockMovements.created_at,
            movement_type: stockMovements.movement_type,
            delta: stockMovements.delta,
            write_off_reason: stockMovements.write_off_reason,
            outbound_ad_hoc_reason: stockMovements.outbound_ad_hoc_reason,
            linked_entity_type: stockMovements.linked_entity_type,
            linked_entity_id: stockMovements.linked_entity_id,
            note: stockMovements.note,
            asset_name: assets.name,
            qr_code: assets.qr_code,
            created_by_name: users.name,
        })
        .from(stockMovements)
        .leftJoin(assets, eq(stockMovements.asset_id, assets.id))
        .leftJoin(users, eq(stockMovements.created_by, users.id))
        .where(and(...conditions))
        // chronological so the running balance accumulates correctly
        .orderBy(asc(stockMovements.created_at));

    const scopeLabel = anchor.group_name ? `${anchor.group_name} (family)` : anchor.name || "Asset";
    const now = new Date();

    const h = createReportWorkbook({
        companyName: anchor.company_name || "",
        label: `Stock Movements — ${scopeLabel}`,
        subtitle: [
            anchor.brand_name ? `Brand: ${anchor.brand_name}` : null,
            movementType ? `Type: ${movementType}` : null,
            fromDate || toDate
                ? `Range: ${fromDate ? fmtDate(fromDate) : "…"} — ${toDate ? fmtDate(toDate) : "…"}`
                : "(all time)",
        ]
            .filter(Boolean)
            .join("   "),
        columns: COLUMNS,
        sheetName: "Stock Movements",
    });

    let runningBalance = 0;
    for (const row of rows) {
        runningBalance += Number(row.delta) || 0;
        const linked =
            row.linked_entity_type && row.linked_entity_id
                ? `${row.linked_entity_type} ${row.linked_entity_id}`
                : "";
        h.sheet.addRow([
            row.created_at ? fmtDate(row.created_at) : "",
            row.movement_type,
            Number(row.delta) || 0,
            runningBalance,
            reasonFor(row.movement_type, row.write_off_reason, row.outbound_ad_hoc_reason),
            linked,
            row.asset_name || "",
            row.qr_code || "",
            row.created_by_name || "",
            row.note || "",
            row.id,
        ]);
    }

    finalizeWorkbook(h, rows.length);
    const filename = reportFilename(
        anchor.company_name || "asset",
        `stock-movements-${assetId.slice(0, 8)}`,
        now
    );
    await sendWorkbook(res, h.wb, filename, rows.length);
});

export const AssetStockMovementsExportControllers = {
    exportAssetStockMovements,
};
