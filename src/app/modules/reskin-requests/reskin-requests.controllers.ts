import { Request, Response } from "express";
import httpStatus from "http-status";
import { ReskinRequestsServices } from "./reskin-requests.services";
import { getRequiredString } from "../../utils/request";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";

// ----------------------------------- LIST RESKIN REQUESTS -----------------------------------
const listReskinRequests = catchAsync(async (req: Request, res: Response) => {
    // Extract platform ID from middleware
    const platformId = (req as any).platformId;

    const orderId = getRequiredString(req.params.orderId, "orderId");

    const requests = await ReskinRequestsServices.listReskinRequests(orderId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Reskin requests fetched successfully.",
        data: requests,
    });
});

// ----------------------------------- PROCESS RESKIN REQUEST -----------------------------------
const processReskinRequest = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platform_id;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.orderId, "orderId");
    const orderItemId = getRequiredString(req.params.orderItemId, "orderItemId");

    const payload = {
        ...req.body,
        platform_id: platformId,
        order_id: orderId,
        order_item_id: orderItemId,
        added_by: user.id,
    };

    const result = await ReskinRequestsServices.processReskinRequest(
        orderItemId,
        orderId,
        platformId,
        payload
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Reskin request processed and cost line item added",
        data: result,
    });
});

// ----------------------------------- COMPLETE RESKIN REQUEST -----------------------------------
const completeReskinRequest = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platform_id;
    const user = (req as any).user;
    const reskinId = getRequiredString(req.params.reskinId, "reskinId");

    const payload = {
        ...req.body,
        completed_by: user.id,
    };

    const result = await ReskinRequestsServices.completeReskinRequest(
        reskinId,
        platformId,
        payload
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.all_complete
            ? "Fabrication complete. All reskins done, order moved to IN_PREPARATION."
            : "Fabrication complete. Other reskins still pending.",
        data: result,
    });
});

// ----------------------------------- CANCEL RESKIN REQUEST -----------------------------------
// const cancelReskinRequest = catchAsync(async (req: Request, res: Response) => {
//     const platformId = (req as any).platform_id;
//     const user = (req as any).user;
//     const reskinId = getRequiredString(req.params.reskinId, "reskinId");

//     const payload = {
//         ...req.body,
//         cancelled_by: user.id,
//     };

//     const result = await ReskinRequestsServices.cancelReskinRequest(
//         reskinId,
//         platformId,
//         payload
//     );

//     const message = result.action === "cancel_order"
//         ? "Reskin cancelled. Order cancellation initiated."
//         : "Reskin cancelled. Order will continue with original asset.";

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message,
//         data: result,
//     });
// });

export const ReskinRequestsControllers = {
    listReskinRequests,
    processReskinRequest,
    completeReskinRequest,
    // cancelReskinRequest,
};
