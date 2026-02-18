import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { PlatformServices } from "./platform.services";

const createPlatform = catchAsync(async (req, res) => {
    const result = await PlatformServices.createPlatform(req.body);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Platform created successfully",
        data: result,
    });
});

const getMyPlatform = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId as string;
    const result = await PlatformServices.getPlatform(platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Platform fetched",
        data: result,
    });
});

const updatePlatformConfig = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId as string;
    const result = await PlatformServices.updatePlatformConfig(platformId, req.body);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Platform config updated",
        data: result,
    });
});

const updatePlatformFeatures = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId as string;
    const result = await PlatformServices.updatePlatformFeatures(platformId, req.body);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Platform features updated",
        data: result,
    });
});

export const PlatformControllers = {
    createPlatform,
    getMyPlatform,
    updatePlatformConfig,
    updatePlatformFeatures,
};
