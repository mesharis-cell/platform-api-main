import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { AssetServices } from "./assets.services";

// ----------------------------------- CREATE ASSET -----------------------------------
const createAsset = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;

    const assetData = {
        ...req.body,
        platform_id: platformId,
    };

    const result = await AssetServices.createAsset(assetData, user);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Asset created successfully",
        data: result,
    });
});

// ----------------------------------- GET ASSETS -------------------------------------
const getAssets = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;

    const result = await AssetServices.getAssets(req.query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Assets fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET ASSET BY ID --------------------------------
const getAssetById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const { id } = req.params;

    const result = await AssetServices.getAssetById(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE ASSET -----------------------------------
const updateAsset = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const { id } = req.params;

    const result = await AssetServices.updateAsset(id, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE ASSET -----------------------------------
const deleteAsset = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const { id } = req.params;

    const result = await AssetServices.deleteAsset(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset deleted successfully",
        data: result,
    });
});

export const AssetControllers = {
    createAsset,
    getAssets,
    getAssetById,
    updateAsset,
    deleteAsset,
};
