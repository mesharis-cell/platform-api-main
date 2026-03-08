import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { WorkflowRequestControllers } from "./workflow-request.controllers";
import { WorkflowRequestSchemas } from "./workflow-request.schemas";

const router = Router();

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(WorkflowRequestSchemas.updateWorkflowRequestSchema),
    WorkflowRequestControllers.updateWorkflowRequest
);

export const WorkflowRequestRoutes = router;
