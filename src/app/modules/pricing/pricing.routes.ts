import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { PricingPreviewControllers } from "./pricing.controllers";

const router = Router();

// Role-preview of an entity's pricing (ADMIN-only). Lets the admin ledger render
// the client / logistics lenses from the SAME server projection the real role
// payloads use — the projection stays the single leak gate.
router.get(
    "/:purposeType/:entityId/preview",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PRICING_REVIEW),
    PricingPreviewControllers.getPricingPreview
);

export const PricingRoutes = router;
