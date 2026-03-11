import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { WorkflowRequestControllers } from "./workflow-request.controllers";
import { WorkflowRequestSchemas } from "./workflow-request.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    WorkflowRequestControllers.listInbox
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(WorkflowRequestSchemas.updateWorkflowRequestSchema),
    WorkflowRequestControllers.updateWorkflowRequest
);

export const WorkflowRequestRoutes = router;
