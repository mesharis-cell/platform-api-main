import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { InboundRequestControllers } from "./inbound-request.controllers";
import { inboundRequestSchemas } from "./inbound-request.schemas";
import featureValidator from "../../middleware/feature-validator";
import { featureNames } from "../../constants/common";

const router = Router();

// Create inbound request
router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    featureValidator(featureNames.enable_inbound_requests),
    payloadValidator(inboundRequestSchemas.createInboundRequestSchema),
    InboundRequestControllers.createInboundRequest
);

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    InboundRequestControllers.getInboundRequests
);

// Get single inbound request with items
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    InboundRequestControllers.getInboundRequestById
);

// Submit for approval (Logistics → Admin)
router.post(
    "/:id/submit-for-approval",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    InboundRequestControllers.submitForApproval
);

// Admin approve request (Admin → Client)
router.post(
    "/:id/approve-request",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(inboundRequestSchemas.approveInboundRequestSchema),
    InboundRequestControllers.approveInboundRequestByAdmin
);

// Client approve or decline quote
router.post(
    "/:id/approve-or-decline-quote",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(inboundRequestSchemas.approveOrDeclineQuoteByClientSchema),
    InboundRequestControllers.approveOrDeclineQuoteByClient
);

// Update inbound request item
router.put(
    "/:id/items/:itemId",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    payloadValidator(inboundRequestSchemas.updateInboundRequestItemSchema),
    InboundRequestControllers.updateInboundRequestItem
);

// Complete inbound request (create assets from items)
router.post(
    "/:id/complete",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(inboundRequestSchemas.completeInboundRequestSchema),
    InboundRequestControllers.completeInboundRequest
);

// Cancel inbound request by admin
router.post(
    "/:id/cancel",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(inboundRequestSchemas.cancelInboundRequestSchema),
    InboundRequestControllers.cancelInboundRequest
);

export const InboundRequestRoutes = router;
