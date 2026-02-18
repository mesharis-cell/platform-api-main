import z from "zod";

const configSchema = z.object({
    logo_url: z.string().url("Logo URL must be a valid URL").optional(),
    primary_color: z
        .string()
        .regex(
            /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
            "Primary color must be a valid hex color code (e.g., #FFF or #FFFFFF)"
        )
        .optional(),
    secondary_color: z
        .string()
        .regex(
            /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
            "Secondary color must be a valid hex color code (e.g., #FFF or #FFFFFF)"
        )
        .optional(),
    logistics_partner_name: z
        .string()
        .max(100, "Logistics partner name must be at most 100 characters")
        .optional(),
    support_email: z.string().email("Support email must be a valid email address").optional(),
    from_email: z
        .string()
        .email("From email must be a valid email address")
        .optional()
        .describe("Verified sender email address used in the 'From' field for all platform emails"),
    currency: z
        .string()
        .length(3, "Currency must be a 3-letter ISO code (e.g., USD, EUR)")
        .optional(),
});

const featureSchema = z.object({
    collections: z.boolean().optional().default(true),
    bulk_import: z.boolean().optional().default(true),
    advanced_reporting: z.boolean().optional().default(false),
    api_access: z.boolean().optional().default(false),
});

const createPlatform = z.object({
    body: z.object({
        name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
        domain: z
            .string()
            .min(1, "Domain is required")
            .max(100, "Domain must be at most 100 characters"),
        config: configSchema.optional(),
        features: featureSchema.optional(),
        is_active: z.boolean().default(true),
    }),
});

export const PlatformSchemas = {
    createPlatform,
};
