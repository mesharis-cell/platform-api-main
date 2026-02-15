import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { ServiceRequestControllers } from "./service-request.controllers";
import { ServiceRequestSchemas } from "./service-request.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    ServiceRequestControllers.listServiceRequests
);

router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    ServiceRequestControllers.getServiceRequestById
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(ServiceRequestSchemas.createServiceRequestSchema),
    ServiceRequestControllers.createServiceRequest
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(ServiceRequestSchemas.updateServiceRequestSchema),
    ServiceRequestControllers.updateServiceRequest
);

router.post(
    "/:id/status",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(ServiceRequestSchemas.updateServiceRequestStatusSchema),
    ServiceRequestControllers.updateServiceRequestStatus
);

router.post(
    "/:id/cancel",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(ServiceRequestSchemas.cancelServiceRequestSchema),
    ServiceRequestControllers.cancelServiceRequest
);

router.post(
    "/:id/commercial-status",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(ServiceRequestSchemas.updateServiceRequestCommercialStatusSchema),
    ServiceRequestControllers.updateServiceRequestCommercialStatus
);

router.post(
    "/:id/approve-quote",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(ServiceRequestSchemas.approveServiceRequestQuoteSchema),
    ServiceRequestControllers.approveServiceRequestQuote
);

export const ServiceRequestRoutes = router;
