import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { LineItemRequestsControllers } from "./line-item-requests.controllers";
import { LineItemRequestsSchemas } from "./line-item-requests.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    LineItemRequestsControllers.listLineItemRequests
);

router.post(
    "/",
    platformValidator,
    auth("LOGISTICS"),
    payloadValidator(LineItemRequestsSchemas.createLineItemRequestSchema),
    LineItemRequestsControllers.createLineItemRequest
);

router.patch(
    "/:id/approve",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(LineItemRequestsSchemas.approveLineItemRequestSchema),
    LineItemRequestsControllers.approveLineItemRequest
);

router.patch(
    "/:id/reject",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(LineItemRequestsSchemas.rejectLineItemRequestSchema),
    LineItemRequestsControllers.rejectLineItemRequest
);

export const LineItemRequestsRoutes = router;
