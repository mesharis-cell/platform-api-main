import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { PricingTierControllers } from "./pricing-tier.controllers";
import { PricingTierSchemas } from "./pricing-tier.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Create pricing tier
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PRICING_TIERS_CREATE),
    payloadValidator(PricingTierSchemas.pricingTierSchema),
    PricingTierControllers.createPricingTier
);

// Get all pricing tiers
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.PRICING_TIERS_READ),
    PricingTierControllers.getPricingTiers
);

// Get pricing tier locations (countries and cities)
router.get(
    "/locations",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    PricingTierControllers.getPricingTierLocations
);

// Calculate pricing for given volume and location
router.get(
    "/calculate",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    PricingTierControllers.calculatePricing
);

// Get pricing tier by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    PricingTierControllers.getPricingTierById
);

// Update pricing tier
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.PRICING_TIERS_UPDATE),
    payloadValidator(PricingTierSchemas.updatePricingTierSchema),
    PricingTierControllers.updatePricingTier
);

// Delete pricing tier
router.delete("/:id", platformValidator, auth("ADMIN"), PricingTierControllers.deletePricingTier);

export const PricingTierRoutes = router;
