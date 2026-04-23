import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import { ExportServices } from "./export.services";

const sendCsv = (res: Response, filename: string, csvData: string) => {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(httpStatus.OK).send(csvData);
};

const exportOrders = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportOrdersService(filters, user, platformId);
    sendCsv(res, "orders.csv", csvData);
});

const exportOrderHistory = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportOrderHistoryService(filters, user, platformId);
    sendCsv(res, "order-history.csv", csvData);
});

const exportAccountsReconciliation = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportAccountsReconciliationService(
        filters,
        user,
        platformId
    );
    sendCsv(res, "accounts-reconciliation.csv", csvData);
});

const exportStockReport = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportStockReportService(filters, user, platformId);
    sendCsv(res, "stock-report.csv", csvData);
});

const exportAssetsOut = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportAssetsOutService(filters, user, platformId);
    sendCsv(res, "assets-out.csv", csvData);
});

const exportInboundLog = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportInboundLogService(filters, user, platformId);
    sendCsv(res, "inbound-log.csv", csvData);
});

const exportRevenueReport = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportRevenueReportService(filters, user, platformId);
    sendCsv(res, "revenue-report.csv", csvData);
});

const exportCostReport = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportCostReportService(filters, user, platformId);
    sendCsv(res, "cost-report.csv", csvData);
});

const exportAssetUtilization = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportAssetUtilizationService(filters, user, platformId);
    sendCsv(res, "asset-utilization.csv", csvData);
});

const exportWorkSummary = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportWorkSummaryService(filters, user, platformId);
    sendCsv(res, "work-summary.csv", csvData);
});

const exportClientIssuanceLog = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const csvData = await ExportServices.exportClientIssuanceLogService(filters, user, platformId);
    sendCsv(res, "client-issuance-log.csv", csvData);
});

const exportFamilyStockMovements = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const familyId = req.params.family_id;

    if (!familyId) {
        res.status(httpStatus.BAD_REQUEST).json({ success: false, message: "family_id required" });
        return;
    }

    const { csv, familyName } = await ExportServices.exportFamilyStockMovementsService(
        familyId,
        filters,
        user,
        platformId
    );
    // Filename-safe family name (strip non-alphanumerics).
    const safeName = familyName.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80) || "family";
    sendCsv(res, `stock-movements-${safeName}.csv`, csv);
});

// Temporarily stubbed pending hardening + move to a local script. The XLSX
// photo path lacked sufficient memory guards and was implicated in the
// 2026-04-23 staging outage. Keep the route registered so clients get a
// clean 503 instead of a 404, but don't touch the service layer at all.
const exportAssetCatalog = catchAsync(async (_req: Request, res: Response) => {
    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        message:
            "Asset catalog export is temporarily disabled. It will be delivered as a local script instead.",
    });
});

export const ExportControllers = {
    exportOrders,
    exportOrderHistory,
    exportAccountsReconciliation,
    exportStockReport,
    exportAssetsOut,
    exportInboundLog,
    exportRevenueReport,
    exportCostReport,
    exportAssetUtilization,
    exportWorkSummary,
    exportClientIssuanceLog,
    exportFamilyStockMovements,
    exportAssetCatalog,
};
