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
    support_email: z
        .string()
        .email("Support email must be a valid email address")
        .optional()
        .describe("Support email shown in email template footers and used for replies"),
    currency: z
        .string()
        .length(3, "Currency must be a 3-letter ISO code (e.g., USD, EUR)")
        .optional(),
    feasibility: z
        .object({
            minimum_lead_hours: z
                .number("Minimum lead hours must be a number")
                .int("Minimum lead hours must be a whole number")
                .min(0, "Minimum lead hours must be 0 or greater")
                .optional(),
            exclude_weekends: z.boolean().optional(),
            weekend_days: z
                .array(z.number().int().min(0).max(6))
                .max(7, "Weekend days can contain at most 7 values")
                .optional(),
            timezone: z.string().optional(),
        })
        .optional(),
    vat_percent: z
        .number("VAT percent must be a number")
        .min(0, "VAT percent must be at least 0")
        .max(100, "VAT percent cannot exceed 100")
        .optional(),
});

const featureSchema = z.object({
    enable_inbound_requests: z.boolean().optional().default(true),
    show_estimate_on_order_creation: z.boolean().optional().default(true),
    require_client_po_number_on_quote_approval: z.boolean().optional().default(true),
    enable_kadence_invoicing: z.boolean().optional().default(false),
    enable_base_operations: z.boolean().optional().default(true),
    enable_asset_bulk_upload: z.boolean().optional().default(false),
    enable_attachments: z.boolean().optional().default(true),
    enable_workflows: z.boolean().optional().default(true),
    enable_service_requests: z.boolean().optional().default(true),
    enable_event_calendar: z.boolean().optional().default(true),
    enable_client_stock_requests: z.boolean().optional().default(true),
});

const featurePatchSchema = z.object({
    enable_inbound_requests: z.boolean().optional(),
    show_estimate_on_order_creation: z.boolean().optional(),
    require_client_po_number_on_quote_approval: z.boolean().optional(),
    enable_kadence_invoicing: z.boolean().optional(),
    enable_base_operations: z.boolean().optional(),
    enable_asset_bulk_upload: z.boolean().optional(),
    enable_attachments: z.boolean().optional(),
    enable_workflows: z.boolean().optional(),
    enable_service_requests: z.boolean().optional(),
    enable_event_calendar: z.boolean().optional(),
    enable_client_stock_requests: z.boolean().optional(),
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
