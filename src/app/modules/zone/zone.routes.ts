import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { ZoneControllers } from "./zone.controllers";
import { zoneSchemas } from "./zone.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Create zone
router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ZONES_CREATE),
    payloadValidator(zoneSchemas.zoneSchema),
    ZoneControllers.createZone
);

// Get all zones
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ZONES_READ),
    ZoneControllers.getZones
);

// Get zone by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    ZoneControllers.getZoneById
);

// Update zone
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ZONES_UPDATE),
    payloadValidator(zoneSchemas.updateZoneSchema),
    ZoneControllers.updateZone
);

// Delete zone
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ZONES_DELETE),
    ZoneControllers.deleteZone
);

export const ZoneRoutes = router;
