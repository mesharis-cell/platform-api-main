import catchAsync from "../../shared/catch-async";
import { UserServices } from "./company.services";
import httpStatus from "http-status";
import sendResponse from "../../shared/send-response";

// -------------------------------------- CREATE USER ---------------------------------
const createUSer = catchAsync(async (req, res, next) => {
  const result = await UserServices.createUser(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "User created successfully",
    data: result,
  });
});

export const UserControllers = { createUSer };
