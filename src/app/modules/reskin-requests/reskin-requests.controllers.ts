import { Request, Response } from "express";
import httpStatus from "http-status";
import { ReskinRequestsServices } from "./reskin-requests.services";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- LIST RESKIN REQUESTS -----------------------------------
const listReskinRequests = async (req: Request, res: Response) => {
    const { platform_id } = req as any;
    const orderId = getRequiredString(req.params.orderId, "orderId");

    const requests = await ReskinRequestsServices.listReskinRequests(orderId, platform_id);

    return res.status(httpStatus.OK).json({
        success: true,
        data: requests,
    });
};

// ----------------------------------- PROCESS RESKIN REQUEST -----------------------------------
const processReskinRequest = async (req: Request, res: Response) => {
    const { platform_id, user } = req as any;
    const orderId = getRequiredString(req.params.orderId, "orderId");
    const orderItemId = getRequiredString(req.params.orderItemId, "orderItemId");
    const payload = {
        ...req.body,
        platform_id,
        order_id: orderId,
        order_item_id: orderItemId,
        added_by: user.id,
    };

    const result = await ReskinRequestsServices.processReskinRequest(
        orderItemId,
        orderId,
        platform_id,
        payload
    );

    return res.status(httpStatus.CREATED).json({
        success: true,
        message: "Reskin request processed and cost line item added",
        data: result,
    });
};

// ----------------------------------- COMPLETE RESKIN REQUEST -----------------------------------
const completeReskinRequest = async (req: Request, res: Response) => {
    const { platform_id, user } = req as any;
    const reskinId = getRequiredString(req.params.reskinId, "reskinId");
    const payload = {
        ...req.body,
        completed_by: user.id,
    };

    const result = await ReskinRequestsServices.completeReskinRequest(
        reskinId as string,
        platform_id,
        payload
    );

    return res.status(httpStatus.OK).json({
        success: true,
        message: result.all_complete
            ? "Fabrication complete. All reskins done, order moved to IN_PREPARATION."
            : "Fabrication complete. Other reskins still pending.",
        data: result,
    });
};

// ----------------------------------- CANCEL RESKIN REQUEST -----------------------------------
const cancelReskinRequest = async (req: Request, res: Response) => {
    const { platform_id, user } = req as any;
    const reskinId = getRequiredString(req.params.reskinId, "reskinId");
    const payload = {
        ...req.body,
        cancelled_by: user.id,
    };

    const result = await ReskinRequestsServices.cancelReskinRequest(
        reskinId as string,
        platform_id,
        payload
    );

    if (result.action === "cancel_order") {
        // Order cancellation will be handled by separate controller
        return res.status(httpStatus.OK).json({
            success: true,
            message: "Reskin cancelled. Order cancellation initiated.",
            data: result,
        });
    } else {
        return res.status(httpStatus.OK).json({
            success: true,
            message: "Reskin cancelled. Order will continue with original asset.",
            data: result,
        });
    }
};

export const ReskinRequestsControllers = {
    listReskinRequests,
    processReskinRequest,
    completeReskinRequest,
    cancelReskinRequest,
};
