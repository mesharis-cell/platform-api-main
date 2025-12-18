import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { zoneSchemas } from "./zone.schemas";

const router = Router();

// Create zone
router.post(
  "/",
  payloadValidator(zoneSchemas.createZoneSchema),
);

// Get all zones
router.get("/")

// Get zone by id
router.get("/:id")

// Update zone
router.patch("/:id", payloadValidator(zoneSchemas.updateZoneSchema));

// Delete zone
router.delete("/:id");

export const ZoneRoutes = router;