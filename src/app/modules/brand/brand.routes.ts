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
router.get("/")

// Get brand by id
router.get("/:id")

// Update brand
router.patch("/:id", payloadValidator(brandsSchemas.updateBrandSchema));

// Delete brand
router.delete("/:id");

export const BrandRoutes = router;
