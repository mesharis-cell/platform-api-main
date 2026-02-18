import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { NotificationRuleControllers } from "./notification-rules.controllers";

const router = Router();

router.get("/", platformValidator, auth("ADMIN"), NotificationRuleControllers.listRules);
router.post("/", platformValidator, auth("ADMIN"), NotificationRuleControllers.createRule);
router.patch("/:id", platformValidator, auth("ADMIN"), NotificationRuleControllers.updateRule);
router.delete("/:id", platformValidator, auth("ADMIN"), NotificationRuleControllers.deleteRule);
router.post(
    "/reset/:event_type",
    platformValidator,
    auth("ADMIN"),
    NotificationRuleControllers.resetEventTypeRules
);

export const NotificationRuleRoutes = router;
