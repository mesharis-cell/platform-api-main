import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { AuthServices } from "./Auth.services";

const login = catchAsync(async (req, res) => {
  const platformId = (req as any).platformId;

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

const forgotPassword = catchAsync(async (req, res) => {
  console.log(req)
  const platformId = (req as any).platformId;

  const result = await AuthServices.forgotPassword(platformId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: result.data || null,
  });
});

export const AuthControllers = {
  login,
  getPlatformByDomain,
  resetPassword,
  forgotPassword,
};
