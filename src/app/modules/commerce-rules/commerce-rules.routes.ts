import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CommerceRulesControllers } from "./commerce-rules.controllers";
import { CommerceRulesSchemas } from "./commerce-rules.schemas";

const router = Router();

// Admin-only management. CLIENT can hit /evaluate to preview their cart
// against the active rule set.
router.get("/", platformValidator, auth("ADMIN"), CommerceRulesControllers.list);

router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(CommerceRulesSchemas.createCommerceRuleSchema),
    CommerceRulesControllers.create
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(CommerceRulesSchemas.updateCommerceRuleSchema),
    CommerceRulesControllers.update
);

router.delete("/:id", platformValidator, auth("ADMIN"), CommerceRulesControllers.remove);

router.post(
    "/evaluate",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    payloadValidator(CommerceRulesSchemas.evaluateCommerceRulesSchema),
    CommerceRulesControllers.evaluate
);

export const CommerceRulesRoutes = router;
