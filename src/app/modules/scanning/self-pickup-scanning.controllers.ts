import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { SelfPickupScanningServices } from "./self-pickup-scanning.services";
import { getRequiredString } from "../../utils/request";

const handoverScan = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const selfPickupId = getRequiredString(req.params.self_pickup_id, "self_pickup_id");
    const result = await SelfPickupScanningServices.selfPickupOutboundScan(
        selfPickupId,
        req.body,
        user,
        platformId
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Item scanned for handover",
        data: result,
    });
});

const addItemMidflow = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const selfPickupId = getRequiredString(req.params.self_pickup_id, "self_pickup_id");
    const body = req.body as { asset_id: string; quantity: number; reason: string };
    const result = await SelfPickupScanningServices.addSelfPickupItemMidflow(
        selfPickupId,
        user,
        platformId,
        body
    );
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Item added to self-pickup",
        data: result,
    });
});

const getHandoverProgress = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const selfPickupId = getRequiredString(req.params.self_pickup_id, "self_pickup_id");
    const result = await SelfPickupScanningServices.getSelfPickupHandoverProgress(
        selfPickupId,
        platformId
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Handover progress",
        data: result,
    });
});

const completeHandover = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const selfPickupId = getRequiredString(req.params.self_pickup_id, "self_pickup_id");
    // Body is optional: empty body preserves "all-or-nothing" legacy behavior.
    // Present body with allow_partial=true opts into partial handover (NO_COST).
    const body = (req.body || {}) as {
        allow_partial?: boolean;
        partial_reason?: string;
        items?: Array<{ self_pickup_item_id: string; scanned_quantity: number }>;
    };
    const result = await SelfPickupScanningServices.completeSelfPickupHandover(
        selfPickupId,
        user,
        platformId,
        body
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: body.allow_partial ? "Partial handover complete" : "Handover complete",
        data: result,
    });
});

const returnScan = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const selfPickupId = getRequiredString(req.params.self_pickup_id, "self_pickup_id");
    const result = await SelfPickupScanningServices.selfPickupInboundScan(
        selfPickupId,
        req.body,
        user,
        platformId
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Item scanned for return",
        data: result,
    });
});

const getReturnProgress = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const selfPickupId = getRequiredString(req.params.self_pickup_id, "self_pickup_id");
    const result = await SelfPickupScanningServices.getSelfPickupReturnProgress(
        selfPickupId,
        platformId
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Return progress",
        data: result,
    });
});

const completeReturn = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const selfPickupId = getRequiredString(req.params.self_pickup_id, "self_pickup_id");
    const settlements = req.body?.settlements ?? [];
    const result = await SelfPickupScanningServices.completeSelfPickupReturn(
        selfPickupId,
        user,
        platformId,
        settlements
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Return complete",
        data: result,
    });
});

export const SelfPickupScanningControllers = {
    handoverScan,
    addItemMidflow,
    getHandoverProgress,
    completeHandover,
    returnScan,
    getReturnProgress,
    completeReturn,
};
