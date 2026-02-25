import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { NotificationRuleControllers } from "./notification-rules.controllers";
import { NotificationRuleSchemas } from "./notification-rules.schemas";

const router = Router();

router.get("/meta", platformValidator, auth("ADMIN"), NotificationRuleControllers.getMeta);
router.get("/", platformValidator, auth("ADMIN"), NotificationRuleControllers.listRules);
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(NotificationRuleSchemas.createRuleSchema),
    NotificationRuleControllers.createRule
);
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(NotificationRuleSchemas.updateRuleSchema),
    NotificationRuleControllers.updateRule
);
router.delete("/:id", platformValidator, auth("ADMIN"), NotificationRuleControllers.deleteRule);
router.post(
    "/reset/:event_type",
    platformValidator,
    auth("ADMIN"),
    NotificationRuleControllers.resetEventTypeRules
);

export const NotificationRuleRoutes = router;
