import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { AuthServices } from "./Auth.services";

const login = catchAsync(async (req, res) => {
  // Extract platform ID from header - using lowercase as express lowercases headers
  const platformId = req.headers["x-platform"] as string;

  const result = await AuthServices.login(req.body, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: result,
  });
});

const getPlatformByDomain = catchAsync(async (req, res) => {
  const result = await AuthServices.getConfigByHostname(req.headers.origin as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Platform fetched successfully",
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const user = (req as any).user;
  const platformId = (req as any).platformId;

  const result = await AuthServices.resetPassword(platformId, user, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: result,
  });
});

export const AuthControllers = {
  login,
  getPlatformByDomain,
  resetPassword,
};
