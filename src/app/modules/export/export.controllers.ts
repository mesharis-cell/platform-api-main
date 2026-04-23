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

const exportAssetCatalog = catchAsync(async (req: Request, res: Response) => {
    const filters = req.query as any;
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await ExportServices.exportAssetCatalogService(filters, user, platformId);
    const safeCompany = (result.companyName ?? "all").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
    const datestamp = new Date().toISOString().slice(0, 10);

    if (result.format === "xlsx") {
        const filename = `asset-catalog-${safeCompany}-${datestamp}.xlsx`;
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.status(httpStatus.OK).send(result.buffer);
        return;
    }

    sendCsv(res, `asset-catalog-${safeCompany}-${datestamp}.csv`, result.csv ?? "");
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
