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

export const InboundRequestRoutes = router;
