import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { UserServices } from "./user.services";

// ----------------------------------- CREATE USER ------------------------------------
const createUser = catchAsync(async (req, res, next) => {
  // Extract platform ID from header
  const platformId = req.headers['x-platform'] as string;
  
  // Merge platform ID with request body
  const userData = {
    ...req.body,
    platform: platformId,
  };
  
  const result = await UserServices.createUser(userData);
  
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
