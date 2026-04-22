import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { AssetServices } from "./assets.services";
import { getRequiredString } from "../../utils/request";

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
    const id = getRequiredString(req.params.id, "id");

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
    const id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.updateAsset(id, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset updated successfully",
        data: result,
    });
});

// ----------------------------------- ADD ASSET UNITS -----------------------------------
const addAssetUnits = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.addAssetUnits(id, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Asset units added successfully",
        data: result,
    });
});

// ----------------------------------- DELETE ASSET -----------------------------------
const deleteAsset = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.deleteAsset(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset deleted successfully",
        data: result,
    });
});

// ----------------------------------- GET ASSET AVAILABILITY STATS -------------------
const getAssetAvailabilityStats = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.getAssetAvailabilityStats(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset availability stats fetched successfully",
        data: result,
    });
});

// ----------------------------------- GET ASSET SCAN HISTORY -------------------------
const getAssetScanHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.getAssetScanHistory(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset scan history fetched successfully",
        data: result,
    });
});

// ----------------------------------- GET AVAILABILITY (unified) ----------------------
const getAvailability = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;

    const result = await AssetServices.getAvailability(req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Availability fetched successfully",
        data: result,
    });
});

// ----------------------------------- BULK UPLOAD ASSETS ---------------------------------
const bulkUploadAssets = catchAsync(async (req, res) => {
    sendResponse(res, {
        statusCode: httpStatus.NOT_IMPLEMENTED,
        success: false,
        message:
            "Asset bulk upload is intentionally stubbed pending the redesigned batch and individual asset model.",
        data: null,
    });
});

// ----------------------------------- ADD MAINTENANCE NOTES ------------------------------
const addConditionHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;

    const result = await AssetServices.addConditionHistory(req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Condition history added successfully",
        data: result,
    });
});

// ----------------------------------- GENERATE QR CODE -----------------------------------
const generateQRCode = catchAsync(async (req, res) => {
    const { qr_code } = req.body;

    const result = await AssetServices.generateQRCode({ qr_code });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "QR code generated successfully",
        data: result,
    });
});

// ----------------------------------- COMPLETE MAINTENANCE -------------------------------
const completeMaintenance = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const asset_id = getRequiredString(req.params.id, "id");

    const user = (req as any).user;
    const result = await AssetServices.completeAssetMaintenance(asset_id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Maintenance completed successfully",
        data: result,
    });
});

// ----------------------------------- SENT ASSET TO MAINTENANCE ------------------------------
const sentAssetToMaintenance = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const asset_id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.sentAssetToMaintenance(asset_id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset sent to maintenance successfully",
        data: result,
    });
});

// ----------------------------------- GET ASSET VERSIONS ---------------------------------
const getAssetVersions = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const assetId = getRequiredString(req.params.id, "id");

    const versions = await AssetServices.getAssetVersions(assetId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset versions retrieved",
        data: versions,
    });
});

const getAssetOrderHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.getAssetOrderHistory(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset order history fetched successfully",
        data: result,
    });
});

const getAssetUsageReport = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await AssetServices.getAssetUsageReport(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset usage report fetched successfully",
        data: result,
    });
});

export const AssetControllers = {
    createAsset,
    getAssets,
    getAssetById,
    updateAsset,
    addAssetUnits,
    deleteAsset,
    getAssetAvailabilityStats,
    getAssetScanHistory,
    getAvailability,
    bulkUploadAssets,
    addConditionHistory,
    generateQRCode,
    completeMaintenance,
    sentAssetToMaintenance,
    getAssetVersions,
    getAssetOrderHistory,
    getAssetUsageReport,
};
