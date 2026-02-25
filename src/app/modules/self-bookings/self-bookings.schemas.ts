import z from "zod";

const createSelfBookingSchema = z.object({
    body: z
        .object({
            booked_for: z.string().min(1, "booked_for is required").max(255),
            reason: z.string().optional(),
            job_reference: z.string().max(255).optional(),
            notes: z.string().optional(),
            items: z
                .array(
                    z.object({
                        asset_id: z.string().uuid("Invalid asset ID"),
                        quantity: z.number().int().min(1, "Quantity must be at least 1"),
                    })
                )
                .min(1, "At least one item is required"),
        })
        .strict(),
});

const returnScanSchema = z.object({
    body: z
        .object({
            qr_code: z.string().min(1, "qr_code is required"),
            quantity: z.number().int().min(1).optional().default(1),
        })
        .strict(),
});

const cancelSelfBookingSchema = z.object({
    body: z
        .object({
            cancellation_reason: z.string().optional(),
        })
        .strict(),
});

const listSelfBookingsSchema = z.object({
    query: z
        .object({
            status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
            search: z.string().optional(),
            page: z.coerce.number().int().min(1).optional().default(1),
            limit: z.coerce.number().int().min(1).max(100).optional().default(20),
        })
        .optional(),
});

export const SelfBookingsSchemas = {
    createSelfBookingSchema,
    returnScanSchema,
    cancelSelfBookingSchema,
    listSelfBookingsSchema,
};
