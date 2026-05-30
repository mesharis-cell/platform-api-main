import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { SelfPickupServices } from "./self-pickup.services";
import { PricingService } from "../../services/pricing.service";
import { getRequiredString } from "../../utils/request";

/**
 * Wrap a raw self-pickup detail response so its self_pickup_pricing is
 * projected for the calling role. Admin additionally receives all three
 * role projections nested under `projections` to power the role-preview
 * tabs on the breakdown card.
 *
 * The base getSelfPickupById returns the raw prices row — internal callers
 * (status transitions, mark-no-cost) want it unprojected. The HTTP layer
 * is where role context lives, so projection happens here.
 */
const withProjectedPricing = (pickup: any, role: "ADMIN" | "LOGISTICS" | "CLIENT") => {
    if (!pickup) return pickup;
    const rawPricing = pickup.self_pickup_pricing;
    const baseProjection = PricingService.projectByRole(rawPricing as any, role);
    const projections =
        role === "ADMIN" ? PricingService.projectAllRolesForAdmin(rawPricing as any) : null;
    const projected =
        role === "ADMIN" && projections
            ? { ...(baseProjection as any), projections }
            : baseProjection;
    return { ...pickup, self_pickup_pricing: projected };
};

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
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    // Enforce owner scope (same company AND creator). Closes a pre-existing
    // gap where any CLIENT could read any company's self-pickup by id.
    const result = await SelfPickupServices.clientGetSelfPickupById(id, platformId, user, "owner");

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup details fetched",
        data: withProjectedPricing(result, user?.role || "CLIENT"),
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
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.getSelfPickupById(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup details fetched",
        data: withProjectedPricing(result, user?.role || "ADMIN"),
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

// Ops-side counterpart to the client `trigger-return`. Same service,
// same guard — just a different role gate at the route layer so logistics
// can start the return process when the client hasn't clicked the button.
const opsTriggerReturn = catchAsync(async (req, res) => {
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

// Edit a self-pickup's details (order-editing P4). Reachable from both the client + ops mounts;
// scope/band/ownership enforced in EntityEditService.
const editSelfPickup = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.editSelfPickup(id, req.body, user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup updated successfully",
        data: result,
    });
});

const getChangeHistory = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.getSelfPickupChangeHistory(id, user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup change history fetched successfully",
        data: result,
    });
});

export const SelfPickupControllers = {
    // Client
    submitFromCart,
    editSelfPickup,
    getChangeHistory,
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
    opsTriggerReturn,
    adminCancel,
    getStatusHistory,
    updateJobNumber,
    returnToLogistics,
    markAsNoCost,
};
