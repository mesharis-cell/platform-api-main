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
        // Item 7: required Yes/No — true = items going out permanently
        // (no return), false = normal pickup-and-return flow.
        is_permanent_placement: z.boolean({
            message: "Please confirm whether these items are being placed permanently",
        }),
        job_number: z.string().max(50).optional(),
        po_number: z.string().max(100).optional(),
        commerce_rule_acknowledgements: z
            .array(
                z
                    .object({
                        rule_id: z.string().uuid("Invalid commerce rule id"),
                    })
                    .strict()
            )
            .optional()
            .default([]),
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

// Mirrors order.schemas.ts:adminApproveQuoteSchema. Blanket margin override
// retired (Phase 1, P1-6) — approval carries no pricing payload.
export const adminApproveQuoteSchema = z.object({
    body: z.object({}).strict().optional().default({}),
});

// Edit an existing self-pickup's details (order-editing feature, P4). All optional + allowlisted;
// EntityEditService re-validates scope, status band, and Tier. Tier A descriptive + Tier C
// (pickup_window / expected_return_at drive the booking window) + items[] (qty/add/remove).
export const editSelfPickupSchema = z.object({
    params: z.object({ id: z.uuid("Invalid self-pickup ID") }),
    body: z
        .object({
            collector_name: z.string().min(1, "Collector name is required").max(100).optional(),
            collector_phone: z.string().min(1, "Collector phone is required").max(50).optional(),
            collector_email: z.string().email("Invalid email").max(255).nullable().optional(),
            notes: z.string().max(2000).nullable().optional(),
            special_instructions: z.string().max(2000).nullable().optional(),
            is_permanent_placement: z.boolean().optional(),
            po_number: z.string().max(100).nullable().optional(),
            job_number: z.string().max(50).nullable().optional(),
            // Tier C — pickup window inputs (drive the booking window via reconcileBookings).
            pickup_window: z.object({ start: z.string(), end: z.string() }).optional(),
            expected_return_at: z
                .string()
                .refine((d) => !isNaN(Date.parse(d)), "Invalid expected return date")
                .transform((d) => new Date(d))
                .nullable()
                .optional(),
            // Item edits — same op model as orders (UPDATE/ADD/REMOVE). SP items have no maintenance.
            items: z
                .array(
                    z
                        .object({
                            op: z.enum(["UPDATE", "ADD", "REMOVE"]).optional(),
                            order_item_id: z.uuid("Invalid item ID").optional(),
                            asset_id: z.uuid("Invalid asset ID").optional(),
                            quantity: z.number().int().positive().optional(),
                            // Shape-parity with the order edit schema. SP items carry NO
                            // maintenance fields (no condition gate, no bundled SR), so this is
                            // accepted but ignored by the SP ADD branch.
                            maintenance_decision: z.enum(["FIX_IN_ORDER", "USE_AS_IS"]).optional(),
                        })
                        .strict()
                        .superRefine((it, ctx) => {
                            const op = it.op ?? "UPDATE";
                            if (
                                op === "UPDATE" &&
                                (!it.order_item_id || it.quantity === undefined)
                            ) {
                                ctx.addIssue({
                                    code: z.ZodIssueCode.custom,
                                    message: "Updating an item requires order_item_id and quantity",
                                });
                            }
                            if (op === "ADD" && (!it.asset_id || it.quantity === undefined)) {
                                ctx.addIssue({
                                    code: z.ZodIssueCode.custom,
                                    message: "Adding an item requires asset_id and quantity",
                                });
                            }
                            if (op === "REMOVE" && !it.order_item_id) {
                                ctx.addIssue({
                                    code: z.ZodIssueCode.custom,
                                    message: "Removing an item requires order_item_id",
                                });
                            }
                        })
                )
                .optional(),
        })
        .strict()
        .refine((b) => Object.keys(b).length > 0, {
            message: "At least one field to edit must be provided",
        }),
});

export const SelfPickupSchemas = {
    submitSelfPickupSchema,
    editSelfPickupSchema,
    cancelSelfPickupSchema,
    updateJobNumberSchema,
    approveQuoteSchema,
    declineQuoteSchema,
    returnToLogisticsSchema,
    adminApproveQuoteSchema,
};
