import { Request, Response } from "express";
import httpStatus from "http-status";
import { PriceServices } from "./price.services";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";

const updatePriceForTransport = catchAsync(async (req: Request, res: Response) => {
    const id = getRequiredString(req.params.id, "id");
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await PriceServices.updatePriceForTransport(id, platformId, user, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Price updated successfully",
        data: result,
    });
});

export const PriceControllers = {
    updatePriceForTransport,
};
