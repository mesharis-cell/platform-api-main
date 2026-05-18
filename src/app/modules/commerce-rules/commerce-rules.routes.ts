import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { CommerceRulesControllers } from "./commerce-rules.controllers";
import { CommerceRulesSchemas } from "./commerce-rules.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_READ, PERMISSIONS.ASSETS_UPDATE),
    CommerceRulesControllers.list
);

router.get(
    "/acknowledgements",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_READ, PERMISSIONS.ASSETS_UPDATE),
    CommerceRulesControllers.listAcknowledgements
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    payloadValidator(CommerceRulesSchemas.createCommerceRuleSchema),
    CommerceRulesControllers.create
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    payloadValidator(CommerceRulesSchemas.updateCommerceRuleSchema),
    CommerceRulesControllers.update
);

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    CommerceRulesControllers.remove
);

router.post(
    "/evaluate",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    payloadValidator(CommerceRulesSchemas.evaluateCommerceRulesSchema),
    CommerceRulesControllers.evaluate
);

export const CommerceRulesRoutes = router;
