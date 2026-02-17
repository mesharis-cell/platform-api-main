import z from "zod";

const createServiceTypeSchema = z.object({
    body: z
        .object({
            name: z
                .string({ message: "Name is required" })
                .min(1, "Name is required")
                .max(100, "Name must be under 100 characters"),
            category: z.enum(
                ["ASSEMBLY", "EQUIPMENT", "HANDLING", "RESKIN", "TRANSPORT", "OTHER"],
                {
                    message:
                        "Category must be ASSEMBLY, EQUIPMENT, HANDLING, RESKIN, TRANSPORT, or OTHER",
                }
            ),
            unit: z
                .string({ message: "Unit is required" })
                .min(1, "Unit is required")
                .max(20, "Unit must be under 20 characters"),
            default_rate: z
                .number({ message: "Default rate must be a number" })
                .min(0, "Default rate must be at least 0")
                .optional()
                .nullable(),
            default_metadata: z.record(z.string(), z.unknown()).optional().default({}),
            transport_rate_id: z.uuid("Invalid transport rate ID").optional().nullable(),
            description: z.string().optional(),
            display_order: z.number().int().optional().default(0),
            is_active: z.boolean().optional().default(true),
        })
        .strict(),
});

const updateServiceTypeSchema = z.object({
    body: z
        .object({
            name: z
                .string()
                .min(1, "Name is required")
                .max(100, "Name must be under 100 characters")
                .optional(),
            unit: z.string().max(20, "Unit must be under 20 characters").optional(),
            default_rate: z
                .number()
                .min(0, "Default rate must be at least 0")
                .optional()
                .nullable(),
            default_metadata: z.record(z.string(), z.unknown()).optional(),
            transport_rate_id: z.uuid("Invalid transport rate ID").optional().nullable(),
            description: z.string().optional(),
            display_order: z.number().int().optional(),
            is_active: z.boolean().optional(),
        })
        .strict(),
});

const syncTransportRateCardsSchema = z.object({
    body: z
        .object({
            include_inactive_rates: z.boolean().optional().default(false),
        })
        .strict(),
});

export const ServiceTypesSchemas = {
    createServiceTypeSchema,
    updateServiceTypeSchema,
    syncTransportRateCardsSchema,
};
