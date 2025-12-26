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

    // Send email notifications (don't block on errors)
    // try {
    //     const emailData = {
    //         orderId: result.orderId,
    //         companyName: result.companyName,
    //         eventStartDate: req.body.eventStartDate,
    //         eventEndDate: req.body.eventEndDate,
    //         venueCity: req.body.venueCity,
    //         totalVolume: result.calculatedVolume,
    //         itemCount: result.itemCount,
    //         viewOrderUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/orders/${result.orderId}`,
    //     };

    //     await OrderServices.sendOrderSubmittedNotifications(emailData);
    //     await OrderServices.sendOrderSubmittedConfirmationToClient(
    //         req.body.contactEmail,
    //         req.body.contactName,
    //         emailData
    //     );
    // } catch (emailError) {
    //     console.error("Error sending email notifications:", emailError);
    // }

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Order submitted successfully. You will receive a quote via email within 24-48 hours.",
        data: result,
    });
});

export const OrderControllers = {
    submitOrder,
};


// {
//     orderId: result.orderId,
//         status: result.status,
//         }