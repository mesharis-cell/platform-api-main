import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { LineItemsControllers } from "./order-line-items.controllers";
import { LineItemsSchemas } from "./order-line-items.schemas";

const router = Router({ mergeParams: true }); // mergeParams to access :orderId

// Get line items
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    LineItemsControllers.getLineItems
);

// Create catalog line item
router.post(
    "/catalog",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(LineItemsSchemas.createCatalogLineItemSchema),
    LineItemsControllers.createCatalogLineItem
);

// Create custom line item
router.post(
    "/custom",
    platformValidator,
    auth("ADMIN"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(LineItemsSchemas.createCustomLineItemSchema),
    LineItemsControllers.createCustomLineItem
);

// Update line item
router.put(
    "/:itemId",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(LineItemsSchemas.updateLineItemSchema),
    LineItemsControllers.updateLineItem
);

// Void (soft delete) line item
router.delete(
    "/:itemId",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.ORDER_LINE_ITEMS_MANAGE),
    payloadValidator(LineItemsSchemas.voidLineItemSchema),
    LineItemsControllers.voidLineItem
);

export const LineItemsRoutes = router;
