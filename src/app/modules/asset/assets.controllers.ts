import httpStatus from "http-status";
import CustomizedError from "../../error/customized-error";
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

// ----------------------------------- GET ASSET AVAILABILITY STATS -------------------
const getAssetAvailabilityStats = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const { id } = req.params;

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
    const { id } = req.params;

    const result = await AssetServices.getAssetScanHistory(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset scan history fetched successfully",
        data: result,
    });
});

// ----------------------------------- GET BATCH AVAILABILITY -------------------------
const getBatchAvailability = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const { asset_ids } = req.body;

    const result = await AssetServices.getBatchAvailability(asset_ids, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Batch availability fetched successfully",
        data: result,
    });
});

// ----------------------------------- CHECK ASSET AVAILABILITY -----------------------
const checkAssetAvailability = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;

    const result = await AssetServices.checkAssetAvailability(req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Availability checked successfully",
        data: result,
    });
});

// ----------------------------------- BULK UPLOAD ASSETS ---------------------------------
const bulkUploadAssets = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const file = (req as any).file as Express.Multer.File;

    // Validate file
    if (!file) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "File is required");
    }

    if (!file.originalname.endsWith('.csv')) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "File must be a CSV (.csv)");
    }

    if (file.size === 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "File is empty");
    }

    if (file.size > 5 * 1024 * 1024) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "File size must be less than 5MB");
    }

    // Call service to process the file
    const result = await AssetServices.bulkUploadAssets(file, user, platformId);

    sendResponse(res, {
        statusCode: result.statusCode,
        success: result.success,
        message: result.message,
        data: result.data,
    });
});

// ----------------------------------- ADD MAINTENANCE NOTES ------------------------------
const addConditionHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;

    const result = await AssetServices.addConditionHistory(
        req.body,
        user,
        platformId
    );

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
    const user = (req as any).user;

    const result = await AssetServices.completeMaintenance(
        req.body,
        user,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Maintenance completed successfully",
        data: result,
    });
});

export const AssetControllers = {
    createAsset,
    getAssets,
    getAssetById,
    updateAsset,
    deleteAsset,
    getAssetAvailabilityStats,
    getAssetScanHistory,
    getBatchAvailability,
    checkAssetAvailability,
    bulkUploadAssets,
    addConditionHistory,
    generateQRCode,
    completeMaintenance,
};
