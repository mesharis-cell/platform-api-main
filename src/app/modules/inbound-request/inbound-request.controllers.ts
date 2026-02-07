import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { InboundRequestServices } from "./inbound-request.services";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- CREATE INBOUND REQUEST --------------------------------
const createInboundRequest = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await InboundRequestServices.createInboundRequest(req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Inbound request created successfully",
        data: result,
    });
});

// ----------------------------------- GET INBOUND REQUESTS ----------------------------------
const getInboundRequests = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const query = req.query;

    const result = await InboundRequestServices.getInboundRequests(query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Inbound requests fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET SINGLE INBOUND REQUEST -----------------------------
const getInboundRequestById = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await InboundRequestServices.getInboundRequestById(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Inbound request fetched successfully",
        data: result,
    });
});


// ----------------------------------- SUBMIT FOR APPROVAL ------------------------------------
const submitForApproval = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await InboundRequestServices.submitForApproval(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Inbound request submitted for Admin approval.",
        data: result,
    });
});

// ----------------------------------- APPROVE INBOUND REQUEST BY ADMIN -----------------------
const approveInboundRequestByAdmin = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await InboundRequestServices.approveInboundRequestByAdmin(id, user, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Inbound request approved successfully.",
        data: result,
    });
});

// ----------------------------------- APPROVE OR DECLINE QUOTE BY CLIENT ---------------------
const approveOrDeclineQuoteByClient = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await InboundRequestServices.approveOrDeclineQuoteByClient(id, user, platformId, req.body);

    const { message, ...rest } = result;

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message,
        data: rest,
    });
});

// ----------------------------------- UPDATE INBOUND REQUEST ITEM ----------------------------
const updateInboundRequestItem = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const requestId = getRequiredString(req.params.id, "id");
    const itemId = getRequiredString(req.params.itemId, "itemId");

    const result = await InboundRequestServices.updateInboundRequestItem(requestId, itemId, user, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Inbound request item updated successfully",
        data: result,
    });
});

// ----------------------------------- COMPLETE INBOUND REQUEST -------------------------------
const completeInboundRequest = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await InboundRequestServices.completeInboundRequest(id, platformId, req.body);

    const { message, ...rest } = result;

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message,
        data: rest,
    });
});

// ----------------------------------- CANCEL INBOUND REQUEST ---------------------------------
const cancelInboundRequest = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await InboundRequestServices.cancelInboundRequest(id, platformId, req.body);

    const { message, ...rest } = result;

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message,
        data: rest,
    });
});

export const InboundRequestControllers = {
    createInboundRequest,
    getInboundRequests,
    getInboundRequestById,
    submitForApproval,
    approveInboundRequestByAdmin,
    approveOrDeclineQuoteByClient,
    updateInboundRequestItem,
    completeInboundRequest,
    cancelInboundRequest
};
