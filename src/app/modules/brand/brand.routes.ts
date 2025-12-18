import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { brandsSchemas } from "./brand.schemas";

const router = Router();

// Create brand
router.post(
  "/",
  payloadValidator(brandsSchemas.brandSchema),
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
