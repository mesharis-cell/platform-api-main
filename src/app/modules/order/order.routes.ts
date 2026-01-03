import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { OrderControllers } from "./order.controllers";
import { orderSchemas } from "./order.schemas";

const router = Router();

// Get orders
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
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
    OrderControllers.exportOrders
);

// Get client dashboard summary
router.get(
    "/dashboard-summary",
    platformValidator,
    auth("CLIENT"),
    OrderControllers.getClientDashboardSummary
);

// Get pricing review orders
router.get(
    "/pricing-review",
    platformValidator,
    auth("ADMIN"),
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

// Approve quote
router.patch(
    "/:id/approve-quote",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(orderSchemas.approveQuoteSchema),
    OrderControllers.approveQuote
);

// Decline quote
router.patch(
    "/:id/decline-quote",
    platformValidator,
    auth("CLIENT"),
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

// Update job number
router.patch(
    "/:id/job-number",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(orderSchemas.updateJobNumberSchema),
    OrderControllers.updateJobNumber
);

// Update time windows
router.patch(
    "/:id/time-windows",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(orderSchemas.updateTimeWindowsSchema),
    OrderControllers.updateTimeWindows
);

// Get order status history
router.get(
    "/:id/status-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
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
    payloadValidator(orderSchemas.adjustLogisticsPricingSchema),
    OrderControllers.adjustLogisticsPricing
);

// Approve standard pricing
router.patch(
    "/:id/approve-standard-pricing",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(orderSchemas.approveStandardPricingSchema),
    OrderControllers.approveStandardPricing
);

// Approve platform pricing
router.patch(
    "/:id/approve-platform-pricing",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(orderSchemas.approvePlatformPricingSchema),
    OrderControllers.approvePlatformPricing
);

// Submit order
router.post(
    "/submit-from-cart",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(orderSchemas.submitOrderSchema),
    OrderControllers.submitOrder
);

export const OrderRoutes = router;
