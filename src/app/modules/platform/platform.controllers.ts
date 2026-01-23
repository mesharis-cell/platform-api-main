import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { PlatformServices } from "./platform.services";

// ----------------------------------- CREATE PLATFORM --------------------------------
const createPlatform = catchAsync(async (req, res, next) => {
    const result = await PlatformServices.createPlatform(req.body);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Platform created successfully",
        data: result,
    });
});

export const PlatformControllers = {
    createPlatform,
};
