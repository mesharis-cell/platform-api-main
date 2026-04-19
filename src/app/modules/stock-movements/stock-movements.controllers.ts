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

const getFamilyStockHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const familyId = getRequiredString(req.params.family_id, "family_id");
    const result = await StockMovementsServices.getFamilyStockHistory(
        familyId,
        platformId,
        req.query as any
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Family stock history fetched",
        data: result,
    });
});

const getLowStockFamilies = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const companyId = req.query.company_id as string | undefined;
    const result = await StockMovementsServices.getLowStockFamilies(platformId, companyId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Low stock families fetched",
        data: result,
    });
});

const createManualAdjustment = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await StockMovementsServices.createManualAdjustment(
        platformId,
        user,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Stock adjustment recorded",
        data: result,
    });
});

export const StockMovementsControllers = {
    getAssetStockHistory,
    getFamilyStockHistory,
    getLowStockFamilies,
    createManualAdjustment,
};
