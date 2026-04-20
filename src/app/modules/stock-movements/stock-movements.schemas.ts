import { z } from "zod";

export const manualAdjustmentSchema = z.object({
    body: z
        .object({
            asset_id: z.string().uuid("Invalid asset ID"),
            delta: z
                .number({ message: "Delta (quantity change) is required" })
                .int("Delta must be an integer")
                .refine((v) => v !== 0, "Delta cannot be zero"),
            reason_note: z
                .string({ message: "Reason is required for manual adjustments" })
                .min(1, "Reason is required")
                .max(500),
            // Optional: when the operator wants to record this as a formal
            // write-off (consumed/lost/damaged/other) instead of a clerical
            // adjustment. Must come with a write_off_reason and negative delta.
            movement_type: z.enum(["ADJUSTMENT", "WRITE_OFF"]).optional(),
            write_off_reason: z.enum(["CONSUMED", "LOST", "DAMAGED", "OTHER"]).optional(),
        })
        .refine((data) => data.movement_type !== "WRITE_OFF" || !!data.write_off_reason, {
            message: "write_off_reason is required when movement_type=WRITE_OFF",
            path: ["write_off_reason"],
        })
        .refine((data) => data.movement_type !== "WRITE_OFF" || data.delta < 0, {
            message: "WRITE_OFF delta must be negative",
            path: ["delta"],
        }),
});

export const StockMovementsSchemas = {
    manualAdjustmentSchema,
};
