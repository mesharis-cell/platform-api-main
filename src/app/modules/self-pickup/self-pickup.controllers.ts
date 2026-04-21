import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { SelfPickupServices } from "./self-pickup.services";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- CLIENT ENDPOINTS ------------------------------------

const submitFromCart = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const companyId = user.company_id;

    const result = await SelfPickupServices.submitSelfPickupFromCart(
        user,
        companyId,
        platformId,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Self-pickup submitted successfully",
        data: result,
    });
});

const clientList = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await SelfPickupServices.clientListSelfPickups(
        platformId,
        user.company_id,
        user.id,
        req.query as any
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickups fetched successfully",
        data: result,
    });
});

const clientDetail = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.getSelfPickupById(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup details fetched",
        data: result,
    });
});

const clientApproveQuote = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.clientApproveQuote(id, platformId, user, {
        po_number: req.body.po_number,
        notes: req.body.notes,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote approved",
        data: result,
    });
});

const clientDeclineQuote = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.clientDeclineQuote(id, platformId, user, {
        decline_reason: req.body.decline_reason,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote declined",
        data: result,
    });
});

const clientTriggerReturn = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.triggerReturn(id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Return initiated",
        data: result,
    });
});

const clientCancel = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.cancelSelfPickup(id, platformId, user, {
        reason: req.body.reason,
        notes: req.body.notes,
        notify_client: req.body.notify_client,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup cancelled",
        data: result,
    });
});

// ----------------------------------- OPERATIONS ENDPOINTS --------------------------------

const adminList = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await SelfPickupServices.listSelfPickups(platformId, req.query as any);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickups fetched successfully",
        data: result,
    });
});

const adminDetail = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.getSelfPickupById(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup details fetched",
        data: result,
    });
});

const submitForApproval = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.submitForApproval(id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Submitted for approval",
        data: result,
    });
});

const approveQuote = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.approveQuote(id, platformId, user, {
        margin_override_percent: req.body?.margin_override_percent,
        margin_override_reason: req.body?.margin_override_reason,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote approved",
        data: result,
    });
});

const markReadyForPickup = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.markReadyForPickup(id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Marked as ready for pickup",
        data: result,
    });
});

const adminCancel = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.cancelSelfPickup(id, platformId, user, {
        reason: req.body.reason,
        notes: req.body.notes,
        notify_client: req.body.notify_client,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup cancelled",
        data: result,
    });
});

const getStatusHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.getStatusHistory(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Status history fetched",
        data: result,
    });
});

const updateJobNumber = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.updateJobNumber(
        id,
        platformId,
        user,
        req.body.job_number
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Job number updated",
        data: result,
    });
});

const returnToLogistics = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.returnToLogistics(id, platformId, user, {
        reason: req.body.reason,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Returned to logistics for revision",
        data: result,
    });
});

const markAsNoCost = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.markAsNoCost(id, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup marked as no-cost",
        data: result,
    });
});

export const SelfPickupControllers = {
    // Client
    submitFromCart,
    clientList,
    clientDetail,
    clientApproveQuote,
    clientDeclineQuote,
    clientTriggerReturn,
    clientCancel,
    // Operations
    adminList,
    adminDetail,
    submitForApproval,
    approveQuote,
    markReadyForPickup,
    adminCancel,
    getStatusHistory,
    updateJobNumber,
    returnToLogistics,
    markAsNoCost,
};
