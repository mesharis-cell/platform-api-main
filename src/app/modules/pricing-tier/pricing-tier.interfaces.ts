import z from "zod";
import { PricingTierSchemas } from "./pricing-tier.schemas";

export type CreatePricingTierPayload = z.infer<typeof PricingTierSchemas.pricingTierSchema>["body"] & {
    platform_id: string;
};

export type UpdatePricingTierPayload = z.infer<typeof PricingTierSchemas.updatePricingTierSchema>["body"];
