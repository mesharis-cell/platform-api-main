import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { PricingTierSchemas } from "./pricing-tier.schemas";

const router = Router();

router.post(
  "/",
  payloadValidator(PricingTierSchemas.createPricingTier),
);

router.get("/");

router.get("/:id");

router.put(
  "/:id",
  payloadValidator(PricingTierSchemas.updatePricingTier),
);

router.delete("/:id");

router.patch("/:id/toggle");

router.get("/calculate");

router.get("/locations")



export const PricingTierRoutes = router;
