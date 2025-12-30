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

// Get order by ID
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    OrderControllers.getOrderById
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

// Submit order
router.post(
    "/submit-from-cart",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(orderSchemas.submitOrderSchema),
    OrderControllers.submitOrder
);

export const OrderRoutes = router;
