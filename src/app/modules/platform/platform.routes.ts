import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { PlatformControllers } from "./platform.controllers";
import { PlatformSchemas } from "./platform.schemas";

const router = Router();

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
    requirePermission(PERMISSIONS.PLATFORM_SETTINGS_UPDATE),
    payloadValidator(PlatformSchemas.updatePlatformConfig),
    PlatformControllers.updatePlatformConfig
);
router.patch(
    "/features",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PLATFORM_SETTINGS_UPDATE),
    payloadValidator(PlatformSchemas.updatePlatformFeatures),
    PlatformControllers.updatePlatformFeatures
);
router.patch(
    "/domain",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PLATFORM_SETTINGS_UPDATE),
    payloadValidator(PlatformSchemas.updatePlatformDomain),
    PlatformControllers.updatePlatformDomain
);
router.get(
    "/url-diagnostics",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PLATFORM_SETTINGS_READ, PERMISSIONS.PLATFORM_SETTINGS_UPDATE),
    PlatformControllers.getPlatformUrlDiagnostics
);

export const PlatformRoutes = router;
