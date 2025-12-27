import httpStatus from "http-status";
import CustomizedError from "../../error/customized-error";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { OrderServices } from "./order.services";

// ----------------------------------- SUBMIT ORDER ---------------------------------------
const submitOrder = catchAsync(async (req, res) => {
    // Extract user and platform ID from middleware
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    // Get company ID from user
    const companyId = user.company_id;
    if (!companyId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    // Submit order
    const result = await OrderServices.submitOrderFromCart(
        user,
        companyId,
        platformId,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Order submitted successfully. You will receive a quote via email within 24-48 hours.",
        data: result,
    });
});

// ----------------------------------- GET ORDERS -----------------------------------------
const getOrders = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await OrderServices.getOrders(req.query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Orders fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET ORDERS -----------------------------------------
const getMyOrders = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await OrderServices.getMyOrders(req.query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Orders fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

export const OrderControllers = {
    submitOrder,
    getOrders,
    getMyOrders,
};


// {
//     orderId: result.orderId,
//         status: result.status,
//         }