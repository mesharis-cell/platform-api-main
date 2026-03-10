import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { WorkflowDefinitionControllers } from "./workflow-definition.controllers";
import { WorkflowDefinitionSchemas } from "./workflow-definition.schemas";

const router = Router();

router.get(
    "/meta",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_READ),
    WorkflowDefinitionControllers.getWorkflowDefinitionMeta
);

router.get(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_READ),
    WorkflowDefinitionControllers.listWorkflowDefinitions
);

router.get(
    "/available",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    WorkflowDefinitionControllers.listAvailableWorkflowDefinitions
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_CREATE),
    payloadValidator(WorkflowDefinitionSchemas.createWorkflowDefinitionSchema),
    WorkflowDefinitionControllers.createWorkflowDefinition
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    payloadValidator(WorkflowDefinitionSchemas.updateWorkflowDefinitionSchema),
    WorkflowDefinitionControllers.updateWorkflowDefinition
);

router.put(
    "/:id/company-overrides",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    payloadValidator(WorkflowDefinitionSchemas.replaceCompanyOverridesSchema),
    WorkflowDefinitionControllers.replaceCompanyOverrides
);

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    WorkflowDefinitionControllers.deleteWorkflowDefinition
);

export const WorkflowDefinitionRoutes = router;
