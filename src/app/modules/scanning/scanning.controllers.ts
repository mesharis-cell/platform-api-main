import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { ScanningServices } from "./scanning.services";

// ----------------------------------- INBOUND SCAN -----------------------------------
const inboundScan = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const { order_id } = req.params;

    const result = await ScanningServices.inboundScan(
        order_id,
        req.body,
        user,
        platformId
    );

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
    const { order_id } = req.params;

    const result = await ScanningServices.getInboundProgress(
        order_id,
        user,
        platformId
    );

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
    const { order_id } = req.params;

    const result = await ScanningServices.completeInboundScan(
        order_id,
        user,
        platformId
    );

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
    const { order_id } = req.params;

    const result = await ScanningServices.outboundScan(
        order_id,
        req.body,
        user,
        platformId
    );

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
    const { order_id } = req.params;

    const result = await ScanningServices.getOutboundProgress(
        order_id,
        user,
        platformId
    );

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
    const { order_id } = req.params;

    const result = await ScanningServices.completeOutboundScan(
        order_id,
        user,
        platformId
    );

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
