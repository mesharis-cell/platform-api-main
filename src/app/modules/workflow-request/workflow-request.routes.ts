import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import featureValidator from "../../middleware/feature-validator";
import { PERMISSIONS } from "../../constants/permissions";
import { featureNames } from "../../constants/common";
import { WorkflowRequestControllers } from "./workflow-request.controllers";
import { WorkflowRequestSchemas } from "./workflow-request.schemas";
import { AttachmentsControllers } from "../attachments/attachments.controllers";
import { AttachmentsSchemas } from "../attachments/attachments.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.WORKFLOW_REQUESTS_READ, PERMISSIONS.WORKFLOW_REQUESTS_UPDATE),
    WorkflowRequestControllers.listInbox
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.WORKFLOW_REQUESTS_UPDATE),
    payloadValidator(WorkflowRequestSchemas.updateWorkflowRequestSchema),
    WorkflowRequestControllers.updateWorkflowRequest
);

// Item 3: workflow attachments — closes the black hole where the service
// writes entity_attachments with entity_type='WORKFLOW_REQUEST' but no
// routes existed to read/list/delete them. Mirrors the entity-scoped
// pattern used by orders, inbound requests, service requests, self-pickups.
router.get(
    "/:id/attachments",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    featureValidator(featureNames.enable_attachments),
    AttachmentsControllers.listForEntity("WORKFLOW_REQUEST")
);

router.post(
    "/:id/attachments",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    featureValidator(featureNames.enable_attachments),
    payloadValidator(AttachmentsSchemas.createEntityAttachmentsSchema),
    AttachmentsControllers.createForEntity("WORKFLOW_REQUEST")
);

export const WorkflowRequestRoutes = router;
