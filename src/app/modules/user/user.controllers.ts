import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { UserServices } from "./user.services";

// ----------------------------------- CREATE USER ------------------------------------
const createUser = catchAsync(async (req, res, next) => {
  const platformId = (req as any).platformId;
  
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

// ----------------------------------- GET USERS --------------------------------------
const getUsers = catchAsync(async (req, res, next) => {
  const platformId = (req as any).platformId;
  const { query } = req;

  const result = await UserServices.getUsers(platformId, query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Users fetched successfully",
    data: result,
  });
});

export const UserControllers = {
  createUser,
  getUsers,
};
