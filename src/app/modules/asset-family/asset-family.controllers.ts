import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { AssetFamilyServices } from "./asset-family.services";

const listAssetFamilies = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await AssetFamilyServices.listAssetFamilies(platformId, user, req.query);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset families fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

const getAssetFamilyById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await AssetFamilyServices.getAssetFamilyById(id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset family fetched successfully",
        data: result,
    });
});

const getAssetFamilyAvailabilityStats = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await AssetFamilyServices.getAssetFamilyAvailabilityStats(id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset family availability stats fetched successfully",
        data: result,
    });
});

const createAssetFamily = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await AssetFamilyServices.createAssetFamily(platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Asset family created successfully",
        data: result,
    });
});

const updateAssetFamily = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await AssetFamilyServices.updateAssetFamily(id, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset family updated successfully",
        data: result,
    });
});

const deleteAssetFamily = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await AssetFamilyServices.deleteAssetFamily(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset family deleted successfully",
        data: result,
    });
});

export const AssetFamilyControllers = {
    listAssetFamilies,
    getAssetFamilyById,
    getAssetFamilyAvailabilityStats,
    createAssetFamily,
    updateAssetFamily,
    deleteAssetFamily,
};
