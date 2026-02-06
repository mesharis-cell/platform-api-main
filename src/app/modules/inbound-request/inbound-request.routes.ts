import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { InboundRequestControllers } from "./inbound-request.controllers";
import { inboundRequestSchemas } from "./inbound-request.schemas";

const router = Router();

// Create inbound request
router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
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

export const InboundRequestRoutes = router;
