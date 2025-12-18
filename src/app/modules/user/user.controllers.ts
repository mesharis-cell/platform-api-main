import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { PlatformServices } from "../platform/platform.services";

const createUser = catchAsync(async (req, res, next) => {
  const result = await PlatformServices.createPlatform(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "User created successfully",
    data: result,
  });
});

export const UserControllers = {
  createUser,
};
