import { z } from "zod";

// Manual stock adjustment payload schema.
//
// Two operator-facing intents map to this endpoint:
//   1. "Correction" — count discrepancy, no order context. Sends
//      movement_type=ADJUSTMENT (or omits it; ADJUSTMENT is the default).
//   2. "Used for an order or pickup" — operator removed a unit from the
//      shelf for a known purpose. Sends movement_type=OUTBOUND_AD_HOC with
//      a sub-reason (REPLACEMENT, INSTALL_CONSUMPTION, REPURPOSED, OTHER).
//      Linked entity is REQUIRED for non-OTHER sub-reasons; for OTHER the
//      linked entity is OPTIONAL but a non-empty reason_note is required.
//
// WRITE_OFF is explicitly REJECTED on this endpoint. Settlement WRITE_OFFs
// must come through the inbound-scan flow which has the booking context to
// auto-populate the linked entity. Allowing WRITE_OFF here was the trap that
// produced the 3 prod incidents where available > total.
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
                .max(2000),
            // Default ADJUSTMENT preserves backwards compat for any caller
            // that omits the field. WRITE_OFF is explicitly disallowed here
            // (server returns 400 if attempted).
            movement_type: z.enum(["ADJUSTMENT", "OUTBOUND_AD_HOC"]).optional(),
            // Sub-reason for OUTBOUND_AD_HOC. Required when movement_type is
            // OUTBOUND_AD_HOC (refine below); ignored otherwise.
            outbound_ad_hoc_reason: z
                .enum(["REPLACEMENT", "INSTALL_CONSUMPTION", "REPURPOSED", "OTHER"])
                .optional(),
            // Linked entity — required for OUTBOUND_AD_HOC unless the
            // sub-reason is OTHER (where it's optional).
            linked_entity_type: z.enum(["ORDER", "SELF_PICKUP"]).optional(),
            linked_entity_id: z.string().uuid().optional(),
        })
        // OUTBOUND_AD_HOC requires a sub-reason
        .refine(
            (data) => data.movement_type !== "OUTBOUND_AD_HOC" || !!data.outbound_ad_hoc_reason,
            {
                message: "outbound_ad_hoc_reason is required when movement_type=OUTBOUND_AD_HOC",
                path: ["outbound_ad_hoc_reason"],
            }
        )
        // OUTBOUND_AD_HOC delta must be negative — it represents stock leaving
        .refine((data) => data.movement_type !== "OUTBOUND_AD_HOC" || data.delta < 0, {
            message: "OUTBOUND_AD_HOC delta must be negative (stock is leaving the warehouse)",
            path: ["delta"],
        })
        // Linked entity must come as a pair if either is supplied
        .refine(
            (data) =>
                (!data.linked_entity_type && !data.linked_entity_id) ||
                (!!data.linked_entity_type && !!data.linked_entity_id),
            {
                message: "linked_entity_type and linked_entity_id must both be set or both omitted",
                path: ["linked_entity_id"],
            }
        )
        // For non-OTHER OUTBOUND_AD_HOC reasons, a linked entity is required
        .refine(
            (data) => {
                if (data.movement_type !== "OUTBOUND_AD_HOC") return true;
                if (data.outbound_ad_hoc_reason === "OTHER") return true;
                return !!data.linked_entity_type && !!data.linked_entity_id;
            },
            {
                message:
                    "Linked order or self-pickup is required for this sub-reason. Pick OTHER if there's no order context.",
                path: ["linked_entity_id"],
            }
        ),
});

export const StockMovementsSchemas = {
    manualAdjustmentSchema,
};
