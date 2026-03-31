import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { NotificationRuleControllers } from "./notification-rules.controllers";
import { NotificationRuleSchemas } from "./notification-rules.schemas";

const router = Router();

router.get(
    "/meta",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.NOTIFICATION_RULES_READ, PERMISSIONS.NOTIFICATION_RULES_UPDATE),
    NotificationRuleControllers.getMeta
);
router.get(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.NOTIFICATION_RULES_READ, PERMISSIONS.NOTIFICATION_RULES_UPDATE),
    NotificationRuleControllers.listRules
);
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.NOTIFICATION_RULES_UPDATE),
    payloadValidator(NotificationRuleSchemas.createRuleSchema),
    NotificationRuleControllers.createRule
);
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.NOTIFICATION_RULES_UPDATE),
    payloadValidator(NotificationRuleSchemas.updateRuleSchema),
    NotificationRuleControllers.updateRule
);
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.NOTIFICATION_RULES_UPDATE),
    NotificationRuleControllers.deleteRule
);
router.post(
    "/reset/:event_type",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.NOTIFICATION_RULES_UPDATE),
    NotificationRuleControllers.resetEventTypeRules
);

export const NotificationRuleRoutes = router;
