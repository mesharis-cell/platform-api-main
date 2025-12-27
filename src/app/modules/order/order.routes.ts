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

// Submit order
router.post(
    "/submit-from-cart",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(orderSchemas.submitOrderSchema),
    OrderControllers.submitOrder
);

export const OrderRoutes = router;
