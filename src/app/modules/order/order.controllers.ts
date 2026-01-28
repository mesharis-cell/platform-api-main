import httpStatus from "http-status";
import CustomizedError from "../../error/customized-error";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { OrderServices } from "./order.services";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- CALCULATE ESTIMATE ---------------------------------
const calculateEstimate = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platform_id;
    const companyId = user.company_id;

    if (!companyId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    const estimate = await OrderServices.calculateEstimate(
        platformId,
        companyId,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Estimate calculated successfully.",
        data: { estimate },
    });
});

// ----------------------------------- SUBMIT ORDER ---------------------------------------
const submitOrderFromCart = catchAsync(async (req, res) => {
    // Extract user and platform ID from middleware
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    // Get company ID from user
    const companyId = user.company_id;
    if (!companyId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    // Submit order
    const result = await OrderServices.submitOrderFromCart(user, companyId, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message:
            "Order submitted successfully. You will receive a quote via email within 24-48 hours.",
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

// ----------------------------------- GET ORDER BY ID ------------------------------------
const getOrderById = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.getOrderById(id, user, platformId, req.query);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE JOB NUMBER ----------------------------------
const updateJobNumber = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const { job_number } = req.body;

    const result = await OrderServices.updateJobNumber(id, job_number, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Job number updated successfully",
        data: result,
    });
});

// ----------------------------------- EXPORT ORDERS --------------------------------------
const exportOrders = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    // Fetch all matching orders (no pagination, max 10,000 records)
    const query = {
        ...req.query,
        page: 1,
        limit: 10000, // Max export limit
        sort_by: "created_at",
        sort_order: "desc",
    };

    const result = await OrderServices.getOrders(query, user, platformId);

    // Build CSV headers
    const headers = [
        "Order ID",
        "Company",
        "Brand",
        "Job Number",
        "Contact Name",
        "Contact Email",
        "Contact Phone",
        "Event Start",
        "Event End",
        "Venue Name",
        "Venue City",
        "Venue Country",
        "Volume (m³)",
        "Weight (kg)",
        "Order Status",
        "Financial Status",
        "Item Count",
        "Created At",
    ];

    // Build CSV rows
    const rows = result.data.map((order) => [
        order.order_id || "",
        order.company?.name || "",
        order.brand?.name || "",
        order.job_number || "",
        order.contact_name || "",
        order.contact_email || "",
        order.contact_phone || "",
        order.event_start_date || "",
        order.event_end_date || "",
        order.venue_name || "",
        (order.venue_location as any)?.city || "",
        (order.venue_location as any)?.country || "",
        (order.calculated_totals as any)?.volume || "",
        (order.calculated_totals as any)?.weight || "",
        order.order_status || "",
        order.financial_status || "",
        order.item_count || 0,
        order.created_at || "",
    ]);

    // Convert to CSV
    const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    const filename = `orders-export-${timestamp}.csv`;

    // Set response headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(httpStatus.OK).send(csvContent);
});

// ----------------------------------- GET ORDER SCAN EVENTS ------------------------------
const getOrderScanEvents = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const orderId = getRequiredString(req.params.orderId, "orderId");

    const result = await OrderServices.getOrderScanEvents(orderId as string, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Scan events fetched successfully",
        data: result,
    });
});

// ----------------------------------- PROGRESS ORDER STATUS ------------------------------
const progressOrderStatus = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.progressOrderStatus(id, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Order status updated to ${req.body.new_status}`,
        data: result,
    });
});

// ----------------------------------- GET ORDER STATUS HISTORY ---------------------------
const getOrderStatusHistory = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.getOrderStatusHistory(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order status history fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE TIME WINDOWS --------------------------------
const updateTimeWindows = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.updateOrderTimeWindows(id, req.body, platformId, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Time windows updated successfully",
        data: result,
    });
});

// ----------------------------------- GET PRICING REVIEW ORDERS --------------------------
// const getPricingReviewOrders = catchAsync(async (req, res) => {
//     const platformId = (req as any).platformId;

//     const result = await OrderServices.getPricingReviewOrders(req.query, platformId);

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Pricing review orders fetched successfully",
//         meta: result.meta,
//         data: result.data,
//     });
// });

// // ----------------------------------- GET ORDER PRICING DETAILS ------------------------------
// const getOrderPricingDetails = catchAsync(async (req, res) => {
//     const platformId = (req as any).platformId;
//     const id = getRequiredString(req.params.id, "id");

//     const result = await OrderServices.getOrderPricingDetails(id, platformId);

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Order pricing details fetched successfully",
//         data: result,
//     });
// });

// // ----------------------------------- ADJUST LOGISTICS PRICING -----------------------------------
// const adjustLogisticsPricing = catchAsync(async (req, res) => {
//     const user = (req as any).user;
//     const platformId = (req as any).platformId;
//     const id = getRequiredString(req.params.id, "id");

//     const result = await OrderServices.adjustLogisticsPricing(id, user, platformId, req.body);

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Logistics pricing adjusted successfully",
//         data: result,
//     });
// });

// ----------------------------------- APPROVE QUOTE ----------------------------------------------
const approveQuote = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.approveQuote(id, user, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote approved successfully.",
        data: result,
    });
});

// ----------------------------------- DECLINE QUOTE ----------------------------------------------
const declineQuote = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.declineQuote(id, user, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote declined successfully.",
        data: result,
    });
});

// ----------------------------------- GET ORDER STATISTICS (CLIENT) ------------------------------
const getOrderStatistics = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    // Get company ID from user
    const companyId = user.company_id;
    if (!companyId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    const result = await OrderServices.getClientOrderStatistics(companyId as string, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order statistics fetched successfully",
        data: result,
    });
});

// ----------------------------------- CHANGE FINANCIAL STATUS -----------------------------------
const sendInvoice = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const orderId = getRequiredString(req.params.orderId, "orderId");

    const result = await OrderServices.sendInvoice(user, platformId, orderId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Invoice sent successfully.",
        data: result,
    });
});

// ----------------------------------- SUBMIT FOR APPROVAL (NEW) -----------------------------------
const submitForApproval = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platform_id;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.submitForApproval(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order submitted for Admin approval.",
        data: result,
    });
});

// ----------------------------------- ADMIN APPROVE QUOTE (NEW) -----------------------------------
// const adminApproveQuote = catchAsync(async (req, res) => {
//     const user = (req as any).user;
//     const platformId = (req as any).platform_id;
//     const id = getRequiredString(req.params.id, "id");
//     const { margin_override_percent, margin_override_reason } = req.body;

//     const marginOverride = margin_override_percent
//         ? { percent: margin_override_percent, reason: margin_override_reason }
//         : undefined;

//     const result = await OrderServices.adminApproveQuote(id, user, platformId, marginOverride);

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Quote approved and sent to client.",
//         data: result,
//     });
// });

// ----------------------------------- RETURN TO LOGISTICS (NEW) -----------------------------------
const returnToLogistics = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platform_id;
    const id = getRequiredString(req.params.id, "id");
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Reason is required (min 10 characters)");
    }

    const result = await OrderServices.returnToLogistics(id, user, platformId, reason);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order returned to Logistics for revision.",
        data: result,
    });
});

// ----------------------------------- CANCEL ORDER (NEW) -----------------------------------
const cancelOrder = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platform_id;
    const id = getRequiredString(req.params.id, "id");

    const result = await OrderServices.cancelOrder(id, platformId, req.body, user);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order cancelled successfully.",
        data: result,
    });
});

// ----------------------------------- UPDATE VEHICLE (NEW) -----------------------------------
// const updateOrderVehicle = catchAsync(async (req, res) => {
//     const user = (req as any).user;
//     const platformId = (req as any).platform_id;
//     const id = getRequiredString(req.params.id, "id");

//     const result = await OrderServices.updateOrderVehicle(id, platformId, req.body, user.id);

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Vehicle type updated successfully.",
//         data: result,
//     });
// });

const getPendingApprovalOrders = catchAsync(async (req, res) => {
    const platformId = (req as any).platform_id;
    const query = req.query;

    const result = await OrderServices.getPendingApprovalOrders(query, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pending approval orders fetched successfully",
        data: result.data,
        meta: result.meta,
    });
});

// const addOrderItem = catchAsync(async (req, res) => {
//     const platformId = (req as any).platform_id;
//     const user = (req as any).user;
//     const orderId = getRequiredString(req.params.id, "id");

//     const result = await OrderServices.addOrderItem(orderId, platformId, req.body, user.id);

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Order item added successfully",
//         data: result,
//     });
// });

// const removeOrderItem = catchAsync(async (req, res) => {
//     const platformId = (req as any).platform_id;
//     const user = (req as any).user;
//     const orderId = getRequiredString(req.params.id, "id");
//     const itemId = getRequiredString(req.params.item_id, "item_id");

//     const result = await OrderServices.removeOrderItem(orderId, itemId, platformId, user.id);

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Order item removed successfully",
//         data: result,
//     });
// });

// const updateOrderItemQuantity = catchAsync(async (req, res) => {
//     const platformId = (req as any).platform_id;
//     const user = (req as any).user;
//     const orderId = getRequiredString(req.params.id, "id");
//     const itemId = getRequiredString(req.params.item_id, "item_id");

//     const result = await OrderServices.updateOrderItemQuantity(
//         orderId,
//         itemId,
//         platformId,
//         req.body.quantity,
//         user.id
//     );

//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         success: true,
//         message: "Order item quantity updated successfully",
//         data: result,
//     });
// });

export const OrderControllers = {
    calculateEstimate,
    submitOrderFromCart,
    getOrders,
    getMyOrders,
    exportOrders,
    getOrderById,
    updateJobNumber,
    getOrderScanEvents,
    progressOrderStatus,
    getOrderStatusHistory,
    updateTimeWindows,
    // getPricingReviewOrders,
    // getOrderPricingDetails,
    // adjustLogisticsPricing,
    approveQuote,
    declineQuote,
    getOrderStatistics,
    sendInvoice,
    // NEW CONTROLLERS
    getPendingApprovalOrders,
    submitForApproval,
    // adminApproveQuote,
    returnToLogistics,
    cancelOrder,
    // updateOrderVehicle,
    // addOrderItem,
    // removeOrderItem,
    // updateOrderItemQuantity,
};
