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
    platform_id: platformId,
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
  const user = (req as any).user;
  const platformId = (req as any).platformId;
  const { query } = req;

  const result = await UserServices.getUsers(platformId, query, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Users fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

// ----------------------------------- GET USER BY ID ---------------------------------
const getUserById = catchAsync(async (req, res, next) => {
  const platformId = (req as any).platformId;
  const { id } = req.params;

  const result = await UserServices.getUserById(id, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User fetched successfully",
    data: result,
  });
});

// ----------------------------------- UPDATE USER ------------------------------------
const updateUser = catchAsync(async (req, res, next) => {
  const user = (req as any).user;
  const platformId = (req as any).platformId;
  const { id } = req.params;

  const result = await UserServices.updateUser(id, platformId, req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User updated successfully",
    data: result,
  });
});

export const UserControllers = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
};
