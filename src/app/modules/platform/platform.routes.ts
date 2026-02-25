import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { PlatformControllers } from "./platform.controllers";
import { PlatformSchemas } from "./platform.schemas";

const router = Router();

router.post(
    "/",
    payloadValidator(PlatformSchemas.createPlatform),
    PlatformControllers.createPlatform
);
router.get(
    "/me",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    PlatformControllers.getMyPlatform
);
router.patch(
    "/config",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(PlatformSchemas.updatePlatformConfig),
    PlatformControllers.updatePlatformConfig
);
router.patch(
    "/features",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(PlatformSchemas.updatePlatformFeatures),
    PlatformControllers.updatePlatformFeatures
);
router.patch(
    "/domain",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(PlatformSchemas.updatePlatformDomain),
    PlatformControllers.updatePlatformDomain
);
router.get(
    "/url-diagnostics",
    platformValidator,
    auth("ADMIN"),
    PlatformControllers.getPlatformUrlDiagnostics
);

export const PlatformRoutes = router;
