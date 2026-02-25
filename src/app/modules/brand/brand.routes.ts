import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { BrandControllers } from "./brand.controllers";
import { brandsSchemas } from "./brand.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Create brand
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.BRANDS_CREATE),
    payloadValidator(brandsSchemas.brandSchema),
    BrandControllers.createBrand
);

// Get all brands
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.BRANDS_READ),
    BrandControllers.getBrands
);

// Get brand by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.BRANDS_READ),
    BrandControllers.getBrandById
);

// Update brand
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.BRANDS_UPDATE),
    payloadValidator(brandsSchemas.updateBrandSchema),
    BrandControllers.updateBrand
);

// Delete brand
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.BRANDS_DELETE),
    BrandControllers.deleteBrand
);

export const BrandRoutes = router;
