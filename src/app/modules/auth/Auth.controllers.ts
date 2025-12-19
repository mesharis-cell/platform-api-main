import httpStatus from "http-status";
import { z } from "zod";
import ApiError from "../../error/ApiError";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { AuthServices } from "./Auth.services";

const login = catchAsync(async (req, res) => {
  // Extract platform ID from header - using lowercase as express lowercases headers
  const platformId = req.headers['x-platform-id'] as string;

  if (!platformId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "x-platform-id header is required");
  }

  // Validate UUID format
  const uuidSchema = z.string().uuid();
  const validationResult = uuidSchema.safeParse(platformId);

  if (!validationResult.success) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Platform ID format (must be UUID)");
  }

  const result = await AuthServices.login(req.body, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: result,
  });
});

export const AuthControllers = {
  login,
};
