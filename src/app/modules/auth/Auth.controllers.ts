import httpStatus from "http-status";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { expiryToMs } from "../../utils/jwt-helpers";
import { AuthServices } from "./Auth.services";

const login = catchAsync(async (req, res) => {
  // Extract platform ID from header - using lowercase as express lowercases headers
  const platformId = req.headers["x-platform"] as string;

  const result = await AuthServices.login(req.body, platformId);

  // Extract tokens from result
  const { access_token, refresh_token, ...userData } = result;

  // Cookie options for access token (synced with JWT expiry from config)
  // Using sameSite: "none" for cross-origin requests (when frontend/backend are on different domains)
  // Note: secure must be true when sameSite is "none"
  const accessTokenCookieOptions = {
    httpOnly: false,
    secure: config.node_env === "production",
    sameSite: config.node_env === "production" ? "none" as const : "lax" as const,
    maxAge: expiryToMs(config.jwt_access_expires_in),
  };

  // Cookie options for refresh token (synced with JWT expiry from config)
  const refreshTokenCookieOptions = {
    httpOnly: false,
    secure: config.node_env === "production",
    sameSite: config.node_env === "production" ? "none" as const : "lax" as const,
    maxAge: expiryToMs(config.jwt_refresh_expires_in),
  };

  // Set cookies
  res.cookie("access_token", access_token, accessTokenCookieOptions);
  res.cookie("refresh_token", refresh_token, refreshTokenCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: userData,
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

const logout = catchAsync(async (_req, res) => {
  // Clear cookie options
  const clearCookieOptions = {
    httpOnly: true,
    secure: config.node_env === "production",
    sameSite: "strict" as const,
  };

  // Clear cookies
  res.clearCookie("access_token", clearCookieOptions);
  res.clearCookie("refresh_token", clearCookieOptions);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged out successfully",
    data: null,
  });
});

export const AuthControllers = {
  login,
  logout,
  getPlatformByDomain,
};
