import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import superAdminAuth from "../../middleware/super-admin-auth";
import { SuperAdminControllers } from "./super-admin.controllers";
import { SuperAdminSchemas } from "./super-admin.schemas";

const router = Router();

router.post("/auth/login", payloadValidator(SuperAdminSchemas.login), SuperAdminControllers.login);
router.post(
    "/auth/refresh",
    payloadValidator(SuperAdminSchemas.refresh),
    SuperAdminControllers.refresh
);
router.get("/auth/me", superAdminAuth, SuperAdminControllers.getMe);

router.get("/platforms", superAdminAuth, SuperAdminControllers.listPlatforms);
router.get("/platforms/:id", superAdminAuth, SuperAdminControllers.getPlatformDetail);
router.patch(
    "/platforms/:id/maintenance",
    superAdminAuth,
    payloadValidator(SuperAdminSchemas.updateMaintenance),
    SuperAdminControllers.updatePlatformMaintenance
);

router.get(
    "/platforms/:id/maintenance/history",
    superAdminAuth,
    SuperAdminControllers.getPlatformMaintenanceHistory
);

export const SuperAdminRoutes = router;
