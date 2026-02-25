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
router.get("/me", PlatformControllers.getMyPlatform);
router.patch("/config", PlatformControllers.updatePlatformConfig);
router.patch("/features", PlatformControllers.updatePlatformFeatures);
router.patch(
    "/domain",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(PlatformSchemas.updatePlatformDomain),
    PlatformControllers.updatePlatformDomain
);

export const PlatformRoutes = router;
