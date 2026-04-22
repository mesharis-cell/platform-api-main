import { z } from "zod";

const damageReportEntrySchema = z.object({
    url: z.string().min(1, { message: "Damage image URL is required" }),
    note: z.string().max(1000, "Damage image note is too long").optional(),
});

const mediaEntrySchema = z.object({
    url: z.string().min(1, { message: "Media URL is required" }),
    note: z.string().max(1000, "Media note is too long").optional(),
});

export const inboundScanSchema = z.object({
    body: z
        .object({
            qr_code: z.string().min(1, { message: "QR code is required" }),
            condition: z.enum(["GREEN", "ORANGE", "RED"]),
            notes: z.string().optional(),
            return_media: z
                .array(mediaEntrySchema)
                .min(2, { message: "At least 2 wide return photos are required" }),
            damage_media: z.array(damageReportEntrySchema).optional().default([]),
            refurb_days_estimate: z.number().int().positive().optional(),
            discrepancy_reason: z.enum(["BROKEN", "LOST", "OTHER"]).optional(),
            quantity: z.number().int().positive().optional(),
        })
        .superRefine((data, ctx) => {
            const damageEntryCount = data.damage_media.length;
            if (data.condition !== "GREEN" && damageEntryCount === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        "At least one damage report photo is required for damaged inbound items",
                    path: ["damage_media"],
                });
            }
        }),
});

export const outboundScanSchema = z.object({
    body: z.object({
        qr_code: z.string().min(1, { message: "QR code is required" }),
        note: z.string().max(2000).optional(),
        quantity: z.number().int().positive().optional(),
    }),
});

export const uploadTruckPhotosSchema = z.object({
    body: z.object({
        asset_ids: z.array(z.string().uuid("Invalid asset ID")).default([]),
        note: z.string().max(2000).optional(),
        media: z.array(mediaEntrySchema).min(1, { message: "At least one photo is required" }),
        trip_phase: z.enum(["OUTBOUND", "RETURN"]).optional().default("OUTBOUND"),
    }),
});

const completeInboundScanSchema = z.object({
    body: z
        .object({
            settlements: z
                .array(
                    z.object({
                        line_id: z.string().uuid("Invalid line item ID"),
                        returned_quantity: z
                            .number()
                            .int()
                            .min(0, "Returned quantity cannot be negative"),
                        write_off_reason: z.enum(["CONSUMED", "LOST", "DAMAGED", "OTHER"]),
                        note: z.string().max(500).optional(),
                    })
                )
                .optional()
                .default([]),
        })
        .optional()
        .default({ settlements: [] }),
});

// Self-pickup return scan mirrors order inboundScan — same fields so logistics
// captures return photos + damage photos + refurb estimate identically. The
// fourth-entity pattern: scanning parity between orders and self-pickups.
export const selfPickupReturnScanSchema = z.object({
    body: z
        .object({
            qr_code: z.string().min(1, { message: "QR code is required" }),
            condition: z.enum(["GREEN", "ORANGE", "RED"]),
            notes: z.string().optional(),
            return_media: z
                .array(mediaEntrySchema)
                .min(2, { message: "At least 2 wide return photos are required" }),
            damage_media: z.array(damageReportEntrySchema).optional().default([]),
            refurb_days_estimate: z.number().int().positive().optional(),
            discrepancy_reason: z.enum(["BROKEN", "LOST", "OTHER"]).optional(),
            quantity: z.number().int().positive().optional(),
        })
        .superRefine((data, ctx) => {
            const damageEntryCount = data.damage_media.length;
            if (data.condition !== "GREEN" && damageEntryCount === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "At least one damage report photo is required for damaged returns",
                    path: ["damage_media"],
                });
            }
        }),
});

// Partial handover body (migration 0048) — only honored when the pickup's
// pricing_mode === "NO_COST"; service rejects STANDARD pickups with a clear
// error. All fields optional: posting an empty body preserves legacy "must
// scan every unit" behavior for back-compat with clients that don't know
// about partial-handover yet.
const completeSelfPickupHandoverSchema = z.object({
    body: z.object({
        allow_partial: z.boolean().optional(),
        partial_reason: z.string().min(5).max(500).optional(),
        items: z
            .array(
                z.object({
                    self_pickup_item_id: z.string().uuid(),
                    scanned_quantity: z.number().int().min(0),
                })
            )
            .optional(),
    }),
});

// Mid-flow item addition (migration 0048, F3). NO_COST pickups at CONFIRMED
// or READY_FOR_PICKUP only. Reason is a non-optional audit field.
const addSelfPickupItemMidflowSchema = z.object({
    body: z.object({
        asset_id: z.string().uuid(),
        quantity: z.number().int().positive(),
        reason: z.string().min(5).max(500),
    }),
});

export const ScanningSchemas = {
    inboundScanSchema,
    outboundScanSchema,
    uploadTruckPhotosSchema,
    completeInboundScanSchema,
    selfPickupReturnScanSchema,
    completeSelfPickupHandoverSchema,
    addSelfPickupItemMidflowSchema,
};
