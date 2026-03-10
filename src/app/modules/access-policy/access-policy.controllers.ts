import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { AccessPolicyServices } from "./access-policy.services";

const listAccessPolicies = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await AccessPolicyServices.listAccessPolicies(
        platformId,
        typeof req.query.role === "string" ? req.query.role : undefined
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Access policies fetched successfully",
        data: result,
    });
});

const getAccessPolicyById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await AccessPolicyServices.getAccessPolicyById(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Access policy fetched successfully",
        data: result,
    });
});

const createAccessPolicy = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await AccessPolicyServices.createAccessPolicy(platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Access policy created successfully",
        data: result,
    });
});

const updateAccessPolicy = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await AccessPolicyServices.updateAccessPolicy(id, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Access policy updated successfully",
        data: result,
    });
});

const deleteAccessPolicy = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await AccessPolicyServices.deleteAccessPolicy(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Access policy deleted successfully",
        data: result,
    });
});

export const AccessPolicyControllers = {
    listAccessPolicies,
    getAccessPolicyById,
    createAccessPolicy,
    updateAccessPolicy,
    deleteAccessPolicy,
};
