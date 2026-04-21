import { z } from "zod";

const selfPickupItemSchema = z.object({
    asset_id: z.string().uuid("Invalid asset ID"),
    quantity: z.number().int().min(1, "Quantity must be at least 1"),
    from_collection_id: z.string().uuid("Invalid collection ID").optional(),
});

export const submitSelfPickupSchema = z.object({
    body: z.object({
        items: z.array(selfPickupItemSchema).min(1, "At least one item is required"),
        brand_id: z.string().uuid("Invalid brand ID").optional(),
        collector_name: z
            .string({ message: "Collector name is required" })
            .min(1, "Collector name is required")
            .max(100),
        collector_phone: z
            .string({ message: "Collector phone is required" })
            .min(1, "Collector phone is required")
            .max(50),
        collector_email: z.string().email("Invalid email").optional(),
        pickup_window: z.object({
            start: z.string({ message: "Pickup window start is required" }),
            end: z.string({ message: "Pickup window end is required" }),
        }),
        expected_return_at: z.string().optional(),
        notes: z.string().max(2000).optional(),
        special_instructions: z.string().max(2000).optional(),
        job_number: z.string().max(50).optional(),
        po_number: z.string().max(100).optional(),
    }),
});

export const cancelSelfPickupSchema = z.object({
    body: z.object({
        reason: z
            .string({ message: "Cancellation reason is required" })
            .min(1, "Cancellation reason is required")
            .max(1000),
        notes: z.string().max(2000).optional(),
        notify_client: z.boolean().optional().default(true),
    }),
});

export const updateJobNumberSchema = z.object({
    body: z.object({
        job_number: z.string().max(50).optional().nullable(),
    }),
});

export const approveQuoteSchema = z.object({
    body: z.object({
        po_number: z
            .string({ message: "PO number is required" })
            .min(1, "PO number is required")
            .max(100),
        notes: z.string().max(2000).optional(),
    }),
});

export const declineQuoteSchema = z.object({
    body: z.object({
        decline_reason: z
            .string({ message: "Decline reason is required" })
            .min(10, "Decline reason must be at least 10 characters")
            .max(2000),
    }),
});

export const returnToLogisticsSchema = z.object({
    body: z.object({
        reason: z
            .string({ message: "Return reason is required" })
            .min(10, "Return reason must be at least 10 characters")
            .max(2000),
    }),
});

// Mirrors order.schemas.ts:adminApproveQuoteSchema.
export const adminApproveQuoteSchema = z.object({
    body: z
        .object({
            margin_override_percent: z
                .number()
                .min(0, "Margin override must be >= 0")
                .max(100, "Margin override must be <= 100")
                .optional(),
            margin_override_reason: z.string().max(1000).optional(),
        })
        .optional()
        .default({}),
});

export const SelfPickupSchemas = {
    submitSelfPickupSchema,
    cancelSelfPickupSchema,
    updateJobNumberSchema,
    approveQuoteSchema,
    declineQuoteSchema,
    returnToLogisticsSchema,
    adminApproveQuoteSchema,
};
