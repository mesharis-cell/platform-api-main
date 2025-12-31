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

// ----------------------------------- EXPORT ORDERS --------------------------------------
const exportOrders = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    // Fetch all matching orders (no pagination, max 10,000 records)
    const query = {
        ...req.query,
        page: 1,
        limit: 10000, // Max export limit
        sort_by: 'created_at',
        sort_order: 'desc',
    };

    const result = await OrderServices.getOrders(query, user, platformId);

    // Build CSV headers
    const headers = [
        'Order ID',
        'Company',
        'Brand',
        'Job Number',
        'Contact Name',
        'Contact Email',
        'Contact Phone',
        'Event Start',
        'Event End',
        'Venue Name',
        'Venue City',
        'Venue Country',
        'Volume (m³)',
        'Weight (kg)',
        'Order Status',
        'Financial Status',
        'Item Count',
        'Created At',
    ];

    // Build CSV rows
    const rows = result.data.map((order) => [
        order.order_id || '',
        order.company?.name || '',
        order.brand?.name || '',
        order.job_number || '',
        order.contact_name || '',
        order.contact_email || '',
        order.contact_phone || '',
        order.event_start_date || '',
        order.event_end_date || '',
        order.venue_name || '',
        (order.venue_location as any)?.city || '',
        (order.venue_location as any)?.country || '',
        (order.calculated_totals as any)?.volume || '',
        (order.calculated_totals as any)?.weight || '',
        order.order_status || '',
        order.financial_status || '',
        order.item_count || 0,
        order.created_at || '',
    ]);

    // Convert to CSV
    const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `orders-export-${timestamp}.csv`;

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(httpStatus.OK).send(csvContent);
});

// ----------------------------------- GET ORDER BY ID ------------------------------------
const getOrderById = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await OrderServices.getOrderById(id, user, platformId);

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
    const { id } = req.params;
    const { job_number } = req.body;

    const result = await OrderServices.updateJobNumber(id, job_number, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Job number updated successfully",
        data: result,
    });
});

// ----------------------------------- GET ORDER SCAN EVENTS ------------------------------
const getOrderScanEvents = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { orderId } = req.params;

    const result = await OrderServices.getOrderScanEvents(orderId, platformId);

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
    const { id } = req.params;

    const result = await OrderServices.progressOrderStatus(
        id,
        req.body,
        user,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Order status updated to ${req.body.new_status}`,
        data: result,
    });
});

// ----------------------------------- GET CLIENT DASHBOARD SUMMARY ----------------------------
const getClientDashboardSummary = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    // Get company ID from user
    const companyId = user.company_id;
    if (!companyId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    const result = await OrderServices.getClientDashboardSummary(companyId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Dashboard summary fetched successfully",
        data: result,
    });
});

// ----------------------------------- GET ORDER STATUS HISTORY ---------------------------
const getOrderStatusHistory = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { id } = req.params;

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
    const { id } = req.params;

    const result = await OrderServices.updateOrderTimeWindows(
        id,
        req.body,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Time windows updated successfully",
        data: result,
    });
});

// ----------------------------------- GET PRICING REVIEW ORDERS --------------------------
const getPricingReviewOrders = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await OrderServices.getPricingReviewOrders(
        req.query,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pricing review orders fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET ORDER PRICING DETAILS ------------------------------
const getOrderPricingDetails = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await OrderServices.getOrderPricingDetails(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order pricing details fetched successfully",
        data: result,
    });
});


export const OrderControllers = {
    submitOrder,
    getOrders,
    getMyOrders,
    exportOrders,
    getOrderById,
    updateJobNumber,
    getOrderScanEvents,
    progressOrderStatus,
    getClientDashboardSummary,
    getOrderStatusHistory,
    updateTimeWindows,
    getPricingReviewOrders,
    getOrderPricingDetails,
};


// {
//     orderId: result.orderId,
//         status: result.status,
//         }