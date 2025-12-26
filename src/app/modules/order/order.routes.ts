import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { OrderControllers } from "./order.controllers";
import { orderSchemas } from "./order.schemas";

const router = Router();

// Submit order
router.post(
    "/",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(orderSchemas.submitOrderSchema),
    OrderControllers.submitOrder
);

export const OrderRoutes = router;
