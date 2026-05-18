import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { StockMovementsServices } from "./stock-movements.services";
import { getRequiredString } from "../../utils/request";

const getAssetStockHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const assetId = getRequiredString(req.params.asset_id, "asset_id");
    const result = await StockMovementsServices.getAssetStockHistory(
        assetId,
        platformId,
        req.query as any
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Stock history fetched",
        data: result,
    });
});

// getFamilyStockHistory controller DELETED in the squash (locked decision #10).

const getLowStockAssets = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const companyId = req.query.company_id as string | undefined;
    const result = await StockMovementsServices.getLowStockAssets(platformId, companyId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Low stock assets fetched",
        data: result,
    });
});

const createManualAdjustment = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await StockMovementsServices.createManualAdjustment(platformId, user, req.body);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Stock adjustment recorded",
        data: result,
    });
});

export const StockMovementsControllers = {
    getAssetStockHistory,
    getLowStockAssets,
    createManualAdjustment,
};
