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
    enable_inbound_requests: z.boolean().optional().default(true),
    show_estimate_on_order_creation: z.boolean().optional().default(true),
    enable_kadence_invoicing: z.boolean().optional().default(false),
});

const featurePatchSchema = z.object({
    enable_inbound_requests: z.boolean().optional(),
    show_estimate_on_order_creation: z.boolean().optional(),
    enable_kadence_invoicing: z.boolean().optional(),
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

const updatePlatformDomain = z.object({
    body: z.object({
        domain: z
            .string()
            .min(1, "Domain is required")
            .max(253, "Domain must be at most 253 characters")
            .regex(
                /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/,
                "Invalid domain format"
            ),
    }),
});

const updatePlatformConfig = z.object({
    body: configSchema.partial(),
});

const updatePlatformFeatures = z.object({
    body: featurePatchSchema,
});

export const PlatformSchemas = {
    createPlatform,
    updatePlatformDomain,
    updatePlatformConfig,
    updatePlatformFeatures,
};
