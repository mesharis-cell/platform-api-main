import { Router } from "express";
import auth from "../../middleware/auth";
import requirePermission from "../../middleware/permission";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { PERMISSIONS } from "../../constants/permissions";
import { OrderControllers } from "./order.controllers";
import { orderSchemas } from "./order.schemas";
import { OrderLineItemsRoutes } from "../order-line-items/order-line-items.routes";
import { ReskinRequestsRoutes } from "../reskin-requests/reskin-requests.routes";

const router = Router();

// Get orders
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ORDERS_READ),
    OrderControllers.getOrders
);

// Get my orders
router.get(
    "/my",
    platformValidator,
    auth("CLIENT"),
    OrderControllers.getMyOrders
);

// Export orders to CSV
router.get(
    "/export",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ORDERS_EXPORT),
    OrderControllers.exportOrders
);

// Get order statistics (CLIENT only)
router.get(
    "/dashboard-summary",
    platformValidator,
    auth("CLIENT"),
    OrderControllers.getOrderStatistics
);


// Get pricing review orders
router.get(
    "/pricing-review",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PRICING_REVIEW),
    OrderControllers.getPricingReviewOrders
);

// Get order by ID
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    OrderControllers.getOrderById
);

// Get order pricing details
router.get(
    "/:id/pricing-details",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    OrderControllers.getOrderPricingDetails
);

// Calculate order estimate (NEW)
router.post(
    "/estimate",
    platformValidator,
    auth("CLIENT"),
    OrderControllers.calculateEstimate
);

// Submit order
router.post(
    "/submit-from-cart",
    platformValidator,
    auth("CLIENT"),
    requirePermission(PERMISSIONS.ORDERS_CREATE),
    payloadValidator(orderSchemas.submitOrderSchema),
    OrderControllers.submitOrder
);

// Approve quote
router.patch(
    "/:id/approve-quote",
    platformValidator,
    auth("CLIENT"),
    requirePermission(PERMISSIONS.QUOTES_APPROVE),
    payloadValidator(orderSchemas.approveQuoteSchema),
    OrderControllers.approveQuote
);

// Decline quote
router.patch(
    "/:id/decline-quote",
    platformValidator,
    auth("CLIENT"),
    requirePermission(PERMISSIONS.QUOTES_DECLINE),
    payloadValidator(orderSchemas.declineQuoteSchema),
    OrderControllers.declineQuote
);


// Progress order status
router.patch(
    "/:id/status",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(orderSchemas.progressStatusSchema),
    OrderControllers.progressOrderStatus
);

// Send invoice
router.patch(
    "/:orderId/send-invoice",
    platformValidator,
    auth("ADMIN"),
    OrderControllers.sendInvoice
);

// Update job number
router.patch(
    "/:id/job-number",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ORDERS_ADD_JOB_NUMBER),
    payloadValidator(orderSchemas.updateJobNumberSchema),
    OrderControllers.updateJobNumber
);

// Update time windows
router.patch(
    "/:id/time-windows",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ORDERS_ADD_TIME_WINDOWS),
    payloadValidator(orderSchemas.updateTimeWindowsSchema),
    OrderControllers.updateTimeWindows
);

// Get order status history
router.get(
    "/:id/status-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ORDERS_VIEW_STATUS_HISTORY),
    OrderControllers.getOrderStatusHistory
);

// Get order scan events
router.get(
    "/:orderId/scan-events",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    OrderControllers.getOrderScanEvents
);

// Adjust logistics pricing
router.patch(
    "/:id/adjust-pricing",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.PRICING_ADJUST),
    payloadValidator(orderSchemas.adjustLogisticsPricingSchema),
    OrderControllers.adjustLogisticsPricing
);

// Approve standard pricing
router.patch(
    "/:id/approve-standard-pricing",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.PRICING_APPROVE_STANDARD),
    payloadValidator(orderSchemas.approveStandardPricingSchema),
    OrderControllers.approveStandardPricing
);

// Approve platform pricing
router.patch(
    "/:id/approve-platform-pricing",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PRICING_ADMIN_APPROVE),
    payloadValidator(orderSchemas.approvePlatformPricingSchema),
    OrderControllers.approvePlatformPricing
);

// ---------------------------------- NEW PRICING WORKFLOW ROUTES ----------------------------------

// Update vehicle type (Logistics)
router.patch(
    "/:id/vehicle",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.PRICING_REVIEW),
    OrderControllers.updateOrderVehicle
);

// Submit for approval (Logistics → Admin)
router.post(
    "/:id/submit-for-approval",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.PRICING_REVIEW),
    OrderControllers.submitForApproval
);

// Admin approve quote (Admin → Client)
router.post(
    "/:id/admin-approve-quote",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PRICING_ADMIN_APPROVE),
    OrderControllers.adminApproveQuote
);

// Return to Logistics (Admin → Logistics)
router.post(
    "/:id/return-to-logistics",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PRICING_ADMIN_APPROVE),
    OrderControllers.returnToLogistics
);

// Cancel order (Admin only)
router.post(
    "/:id/cancel",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ORDERS_CANCEL),
    OrderControllers.cancelOrder
);

// ---------------------------------- NESTED ROUTES (NEW) ----------------------------------

// Order Line Items (nested under /order/:orderId/line-items)
router.use("/:orderId/line-items", OrderLineItemsRoutes);

// Reskin Requests (nested under /order/:orderId/reskin-requests)
router.use("/:orderId/reskin-requests", ReskinRequestsRoutes);

export const OrderRoutes = router;
