import httpStatus from "http-status";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
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
  const hostname = req.query.hostname as string;

  if(!hostname){
    throw new CustomizedError(httpStatus.BAD_REQUEST, "Hostname is required");
  }

  const result = await AuthServices.getPlatformByDomain(hostname);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Platform fetched successfully",
    data: result,
  });
});

export const AuthControllers = {
  login,
  getPlatformByDomain,
};
