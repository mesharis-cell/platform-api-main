import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { NotificationLogServices } from "./notification-logs.services";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- GET FAILED NOTIFICATIONS -----------------------------------------
const getFailedNotifications = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const { status, notification_type, order_id, limit, offset } = req.query;

    // Validate status if provided
    if (status && !["FAILED", "RETRYING"].includes(status as string)) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Invalid status. Must be FAILED or RETRYING",
            data: null,
        });
    }

    const result = await NotificationLogServices.getFailedNotifications(platformId, {
        status: status as "FAILED" | "RETRYING" | undefined,
        notification_type: notification_type as string | undefined,
        order_id: order_id as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Failed notifications fetched successfully",
        data: result,
    });
});

// ----------------------------------- RETRY NOTIFICATION -----------------------------------------
const retryNotification = catchAsync(async (req, res) => {
    const id = getRequiredString(req.params.id, "id");

    const result = await NotificationLogServices.retryNotification(id);

    if (!result.success) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: result.error || "Failed to retry notification",
            data: null,
        });
    }

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Notification retry successful",
        data: null,
    });
});

export const NotificationLogControllers = {
    getFailedNotifications,
    retryNotification,
};
