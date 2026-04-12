import { z } from "zod";

export const manualAdjustmentSchema = z.object({
    body: z.object({
        asset_id: z.string().uuid("Invalid asset ID"),
        delta: z
            .number({ message: "Delta (quantity change) is required" })
            .int("Delta must be an integer")
            .refine((v) => v !== 0, "Delta cannot be zero"),
        reason_note: z
            .string({ message: "Reason is required for manual adjustments" })
            .min(1, "Reason is required")
            .max(500),
    }),
});

export const StockMovementsSchemas = {
    manualAdjustmentSchema,
};
