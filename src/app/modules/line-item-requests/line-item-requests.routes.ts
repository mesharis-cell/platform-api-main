import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { LineItemRequestsControllers } from "./line-item-requests.controllers";
import { LineItemRequestsSchemas } from "./line-item-requests.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.LINE_ITEM_REQUESTS_READ, PERMISSIONS.LINE_ITEM_REQUESTS_REVIEW),
    LineItemRequestsControllers.listLineItemRequests
);

router.post(
    "/",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.LINE_ITEM_REQUESTS_CREATE),
    payloadValidator(LineItemRequestsSchemas.createLineItemRequestSchema),
    LineItemRequestsControllers.createLineItemRequest
);

router.patch(
    "/:id/approve",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.LINE_ITEM_REQUESTS_REVIEW),
    payloadValidator(LineItemRequestsSchemas.approveLineItemRequestSchema),
    LineItemRequestsControllers.approveLineItemRequest
);

router.patch(
    "/:id/reject",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.LINE_ITEM_REQUESTS_REVIEW),
    payloadValidator(LineItemRequestsSchemas.rejectLineItemRequestSchema),
    LineItemRequestsControllers.rejectLineItemRequest
);

export const LineItemRequestsRoutes = router;
