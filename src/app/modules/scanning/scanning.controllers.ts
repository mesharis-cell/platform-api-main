import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { ScanningServices } from "./scanning.services";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- INBOUND SCAN -----------------------------------
const inboundScan = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.order_id, "order_id");

    const result = await ScanningServices.inboundScan(orderId, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message,
        data: {
            asset: result.asset,
            progress: result.progress,
        },
    });
});

// ----------------------------------- GET INBOUND PROGRESS -------------------------------
const getInboundProgress = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.order_id, "order_id");

    const result = await ScanningServices.getInboundProgress(orderId, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Scan progress retrieved successfully",
        data: result,
    });
});

// ----------------------------------- COMPLETE INBOUND SCAN ------------------------------
const completeInboundScan = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.order_id, "order_id");

    const result = await ScanningServices.completeInboundScan(orderId, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message,
        data: {
            order_id: result.order_id,
            new_status: result.new_status,
        },
    });
});

// ================================= OUTBOUND SCANNING =================================

// ----------------------------------- OUTBOUND SCAN --------------------------------------
const outboundScan = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const user = (req as any).user;
    const orderId = getRequiredString(req.params.order_id, "order_id");

    const result = await ScanningServices.outboundScan(orderId, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Item scanned out successfully",
        data: result,
    });
});

// ----------------------------------- GET OUTBOUND PROGRESS -----------------------------------
const getOutboundProgress = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.order_id, "order_id");

    const result = await ScanningServices.getOutboundProgress(orderId, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Outbound scan progress retrieved successfully",
        data: result,
    });
});

// ----------------------------------- COMPLETE OUTBOUND SCAN ------------------------------
const completeOutboundScan = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.order_id, "order_id");

    const result = await ScanningServices.completeOutboundScan(orderId, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message,
        data: {
            order_id: result.order_id,
            new_status: result.new_status,
        },
    });
});

export const ScanningControllers = {
    inboundScan,
    getInboundProgress,
    completeInboundScan,
    outboundScan,
    completeOutboundScan,
    getOutboundProgress,
};
