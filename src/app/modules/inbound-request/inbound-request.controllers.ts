import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { InboundRequestServices } from "./inbound-request.services";

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

export const InboundRequestControllers = {
    createInboundRequest,
    getInboundRequests,
};
