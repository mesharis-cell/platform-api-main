import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { OrderLineItemsControllers } from "./order-line-items.controllers";
import { OrderLineItemsSchemas } from "./order-line-items.schemas";

const router = Router({ mergeParams: true }); // mergeParams to access :orderId

// List line items for an order
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    OrderLineItemsControllers.listOrderLineItems
);

// Create catalog line item
router.post(
    "/catalog",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(OrderLineItemsSchemas.createCatalogLineItemSchema),
    OrderLineItemsControllers.createCatalogLineItem
);

// Create custom line item
router.post(
    "/custom",
    platformValidator,
    auth("ADMIN"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(OrderLineItemsSchemas.createCustomLineItemSchema),
    OrderLineItemsControllers.createCustomLineItem
);

// Update line item
router.put(
    "/:itemId",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(OrderLineItemsSchemas.updateLineItemSchema),
    OrderLineItemsControllers.updateLineItem
);

// Void (soft delete) line item
router.delete(
    "/:itemId",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(OrderLineItemsSchemas.voidLineItemSchema),
    OrderLineItemsControllers.voidLineItem
);

export const OrderLineItemsRoutes = router;
