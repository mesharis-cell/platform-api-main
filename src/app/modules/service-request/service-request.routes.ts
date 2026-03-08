import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { ServiceRequestControllers } from "./service-request.controllers";
import { ServiceRequestSchemas } from "./service-request.schemas";
import { AttachmentsControllers } from "../attachments/attachments.controllers";
import { AttachmentsSchemas } from "../attachments/attachments.schemas";
import { WorkflowRequestControllers } from "../workflow-request/workflow-request.controllers";
import { WorkflowRequestSchemas } from "../workflow-request/workflow-request.schemas";

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

router.get(
    "/:id/attachments",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    AttachmentsControllers.listForEntity("SERVICE_REQUEST")
);

router.post(
    "/:id/attachments",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    payloadValidator(AttachmentsSchemas.createEntityAttachmentsSchema),
    AttachmentsControllers.createForEntity("SERVICE_REQUEST")
);

router.get(
    "/:id/workflow-requests",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    WorkflowRequestControllers.listForEntity("SERVICE_REQUEST")
);

router.post(
    "/:id/workflow-requests",
    platformValidator,
    auth("LOGISTICS"),
    payloadValidator(WorkflowRequestSchemas.createWorkflowRequestSchema),
    WorkflowRequestControllers.createForEntity("SERVICE_REQUEST")
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
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

router.post(
    "/:id/quote-response",
    platformValidator,
    auth("CLIENT"),
    payloadValidator(ServiceRequestSchemas.respondServiceRequestQuoteSchema),
    ServiceRequestControllers.respondToServiceRequestQuote
);

router.post(
    "/:id/concession",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(ServiceRequestSchemas.applyServiceRequestConcessionSchema),
    ServiceRequestControllers.applyServiceRequestConcession
);

export const ServiceRequestRoutes = router;
