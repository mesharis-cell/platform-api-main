import z from "zod";

const createCatalogLineItemSchema = z.object({
    body: z
        .object({
            service_type_id: z.string().uuid("Invalid service type ID"),
            quantity: z
                .number({ message: "Quantity must be a number" })
                .positive("Quantity must be greater than 0"),
            unit_rate: z
                .number({ message: "Unit rate must be a number" })
                .min(0, "Unit rate must be at least 0"),
            notes: z.string().optional(),
        })
        .strict(),
});

const createCustomLineItemSchema = z.object({
    body: z
        .object({
            description: z
                .string({ message: "Description is required" })
                .min(1, "Description is required")
                .max(200, "Description must be under 200 characters"),
            category: z.enum(["ASSEMBLY", "EQUIPMENT", "HANDLING", "RESKIN", "OTHER"], {
                message: "Invalid category",
            }),
            total: z
                .number({ message: "Total must be a number" })
                .positive("Total must be greater than 0"),
            notes: z.string().optional(),
            reskin_request_id: z.string().uuid("Invalid reskin request ID").optional(),
        })
        .strict(),
});

const updateLineItemSchema = z.object({
    body: z
        .object({
            quantity: z.number().positive().optional(),
            unit_rate: z.number().min(0).optional(),
            total: z.number().positive().optional(),
            notes: z.string().optional(),
        })
        .strict(),
});

const voidLineItemSchema = z.object({
    body: z
        .object({
            void_reason: z
                .string({ message: "Void reason is required" })
                .min(10, "Void reason must be at least 10 characters"),
        })
        .strict(),
});

export const OrderLineItemsSchemas = {
    createCatalogLineItemSchema,
    createCustomLineItemSchema,
    updateLineItemSchema,
    voidLineItemSchema,
};
