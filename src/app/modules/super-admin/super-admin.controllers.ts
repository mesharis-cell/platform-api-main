import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { SuperAdminServices } from "./super-admin.services";

const login = catchAsync(async (req, res) => {
    const result = await SuperAdminServices.login(req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Super admin logged in successfully",
        data: result,
    });
});

const refresh = catchAsync(async (req, res) => {
    const result = await SuperAdminServices.refresh(req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Super admin token refreshed successfully",
        data: result,
    });
});

const getMe = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const result = await SuperAdminServices.getMe(user.id);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Super admin fetched successfully",
        data: result,
    });
});

const listPlatforms = catchAsync(async (_req, res) => {
    const result = await SuperAdminServices.listPlatforms();

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Platforms fetched successfully",
        data: result,
    });
});

const getPlatformDetail = catchAsync(async (req, res) => {
    const platformId = getRequiredString(req.params.id, "id");
    const result = await SuperAdminServices.getPlatformDetail(platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Platform details fetched successfully",
        data: result,
    });
});

const updatePlatformMaintenance = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = getRequiredString(req.params.id, "id");
    const result = await SuperAdminServices.updatePlatformMaintenance(
        platformId,
        user.id,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Platform maintenance updated successfully",
        data: result,
    });
});

const getPlatformMaintenanceHistory = catchAsync(async (req, res) => {
    const platformId = getRequiredString(req.params.id, "id");
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await SuperAdminServices.getPlatformMaintenanceHistory(
        platformId,
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Maintenance history fetched",
        data: result,
    });
});

export const SuperAdminControllers = {
    login,
    refresh,
    getMe,
    listPlatforms,
    getPlatformDetail,
    updatePlatformMaintenance,
    getPlatformMaintenanceHistory,
};
