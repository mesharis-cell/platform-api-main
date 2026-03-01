import { Request, Response } from "express";
import httpStatus from "http-status";
import { getRequiredString } from "../../utils/request";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { LineItemRequestsServices } from "./line-item-requests.services";

const listLineItemRequests = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const result = await LineItemRequestsServices.listLineItemRequests(platformId, req.query);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line item requests fetched successfully",
        data: result,
    });
});

const createLineItemRequest = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;

    const result = await LineItemRequestsServices.createLineItemRequest({
        ...req.body,
        platform_id: platformId,
        requested_by: user.id,
    });

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Line item request created successfully",
        data: result,
    });
});

const approveLineItemRequest = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await LineItemRequestsServices.approveLineItemRequest(
        id,
        platformId,
        req.body,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line item request approved successfully",
        data: result,
    });
});

const rejectLineItemRequest = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await LineItemRequestsServices.rejectLineItemRequest(
        id,
        platformId,
        req.body,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line item request rejected successfully",
        data: result,
    });
});

export const LineItemRequestsControllers = {
    listLineItemRequests,
    createLineItemRequest,
    approveLineItemRequest,
    rejectLineItemRequest,
};
