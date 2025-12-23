import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { BrandControllers } from "./brand.controllers";
import { brandsSchemas } from "./brand.schemas";

const router = Router();

// Create brand
router.post(
  "/",
  platformValidator,
  auth('ADMIN'),
  payloadValidator(brandsSchemas.brandSchema),
  BrandControllers.createBrand
);

// Get all brands
router.get("/", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), BrandControllers.getBrands);

// Get brand by id
router.get("/:id", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), BrandControllers.getBrandById);

// Update brand
router.patch("/:id", platformValidator, auth('ADMIN'), payloadValidator(brandsSchemas.updateBrandSchema), BrandControllers.updateBrand);

// Delete brand
router.delete("/:id", platformValidator, auth('ADMIN'), BrandControllers.deleteBrand);

export const BrandRoutes = router;
