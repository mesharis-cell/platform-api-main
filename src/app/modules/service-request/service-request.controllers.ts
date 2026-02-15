import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { ServiceRequestServices } from "./service-request.services";

const listServiceRequests = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await ServiceRequestServices.listServiceRequests(
        req.query as Record<string, any>,
        platformId,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Service requests retrieved successfully",
        data: result.data,
        meta: result.meta,
    });
});

const getServiceRequestById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await ServiceRequestServices.getServiceRequestById(id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Service request retrieved successfully",
        data: result,
    });
});

const createServiceRequest = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await ServiceRequestServices.createServiceRequest(req.body, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Service request created successfully",
        data: result,
    });
});

const updateServiceRequest = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await ServiceRequestServices.updateServiceRequest(
        id,
        req.body,
        platformId,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Service request updated successfully",
        data: result,
    });
});

const updateServiceRequestStatus = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await ServiceRequestServices.updateServiceRequestStatus(
        id,
        req.body,
        platformId,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Service request status updated successfully",
        data: result,
    });
});

const cancelServiceRequest = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await ServiceRequestServices.cancelServiceRequest(
        id,
        req.body,
        platformId,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Service request cancelled successfully",
        data: result,
    });
});

const updateServiceRequestCommercialStatus = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await ServiceRequestServices.updateServiceRequestCommercialStatus(
        id,
        req.body,
        platformId,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Service request commercial status updated successfully",
        data: result,
    });
});

const approveServiceRequestQuote = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await ServiceRequestServices.approveServiceRequestQuote(
        id,
        req.body,
        platformId,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Service request quote approved successfully",
        data: result,
    });
});

export const ServiceRequestControllers = {
    listServiceRequests,
    getServiceRequestById,
    createServiceRequest,
    updateServiceRequest,
    updateServiceRequestStatus,
    cancelServiceRequest,
    updateServiceRequestCommercialStatus,
    approveServiceRequestQuote,
};
