import z from "zod";

const createPricingTier = z.object({
  body: z.object({
    country: z
      .string()
      .min(1, { message: "Country is required" })
      .max(50, { message: "Country cannot exceed 50 characters" }),
    city: z
      .string()
      .min(1, { message: "City is required" })
      .max(50, { message: "City cannot exceed 50 characters" }),
    volumeMin: z.number({ message: "Volume Min must be a number" }),
    volumeMax: z.number({ message: "Volume Max must be a number" }).optional(),
    basePrice: z.number({ message: "Base Price must be a number" }),
    isActive: z.boolean().optional().default(true),
  }),
});

const updatePricingTier = z.object({
  body: z.object({
    country: z
      .string()
      .min(1, { message: "Country cannot be empty" })
      .max(50, { message: "Country cannot exceed 50 characters" })
      .optional(),
    city: z
      .string()
      .min(1, { message: "City cannot be empty" })
      .max(50, { message: "City cannot exceed 50 characters" })
      .optional(),
    volumeMin: z.number({ message: "Volume Min must be a number" }).optional(),
    volumeMax: z.number({ message: "Volume Max must be a number" }).optional(),
    basePrice: z.number({ message: "Base Price must be a number" }).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const PricingTierSchemas = {
  createPricingTier,
  updatePricingTier,
};
