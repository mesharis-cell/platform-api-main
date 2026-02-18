import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
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

export const PlatformRoutes = router;
