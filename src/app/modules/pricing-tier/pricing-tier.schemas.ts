import z from "zod";

const pricingTierSchema = z.object({
    body: z.object({
        country: z
            .string({ message: "Country is required" })
            .min(1, "Country is required")
            .max(50, "Country must be under 50 characters"),
        city: z
            .string({ message: "City is required" })
            .min(1, "City is required")
            .max(50, "City must be under 50 characters"),
        volume_min: z
            .number({ message: "Minimum volume must be a number" })
            .min(0, "Minimum volume must be at least 0"),
        volume_max: z
            .number({ message: "Maximum volume must be a number" })
            .min(0, "Maximum volume must be at least 0")
            .optional()
            .nullable(),
        base_price: z
            .number({ message: "Base price must be a number" })
            .min(0, "Base price must be at least 0"),
        is_active: z.boolean().optional().default(true),
    }).strict().refine(
        (data) => {
            if (data.volume_max !== null && data.volume_max !== undefined) {
                return data.volume_max >= data.volume_min;
            }
            return true;
        },
        {
            message: "Maximum volume must be greater than or equal to minimum volume",
            path: ["volume_max"],
        }
    ),
});

const updatePricingTierSchema = z.object({
    body: z.object({
        country: z
            .string()
            .min(1, "Country cannot be empty")
            .max(50, "Country must be under 50 characters")
            .optional(),
        city: z
            .string()
            .min(1, "City cannot be empty")
            .max(50, "City must be under 50 characters")
            .optional(),
        volume_min: z
            .number()
            .min(0, "Minimum volume must be at least 0")
            .optional(),
        volume_max: z
            .number()
            .min(0, "Maximum volume must be at least 0")
            .optional()
            .nullable(),
        base_price: z
            .number()
            .min(0, "Base price must be at least 0")
            .optional(),
        is_active: z.boolean().optional(),
    }).strict().refine(
        (data) => {
            if (data.volume_min !== undefined && data.volume_max !== null && data.volume_max !== undefined) {
                return data.volume_max > data.volume_min;
            }
            return true;
        },
        {
            message: "Maximum volume must be greater than minimum volume",
            path: ["volume_max"],
        }
    ),
});

export const PricingTierSchemas = {
    pricingTierSchema,
    updatePricingTierSchema,
};
