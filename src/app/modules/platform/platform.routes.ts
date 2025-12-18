import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { PlatformControllers } from "./platform.controllers";
import { PlatformSchemas } from "./platform.schemas";

const router = Router();

router.post("/", payloadValidator(PlatformSchemas.createPlatform), PlatformControllers.createPlatform);

export const PlatformRoutes = router;
