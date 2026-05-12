import { z } from "zod";

// Item 6: v1 surfaces QUANTITY + COMPANION + WARN only. Schema accepts
// the full enum so v2 can ship UI for the rest without re-validating.
const targetSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("ASSET"), asset_id: z.string().uuid() }),
    z.object({ kind: z.literal("FAMILY"), family_id: z.string().uuid() }),
]);

const predicateSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("QUANTITY_LT"), threshold: z.number().int().positive() }),
    z.object({ kind: z.literal("QUANTITY_GT"), threshold: z.number().int().positive() }),
    z.object({ kind: z.literal("COMPANION_REQUIRED"), companion_target: targetSchema }),
]);

export const createCommerceRuleSchema = z.object({
    body: z
        .object({
            company_id: z.string().uuid().nullable().optional(),
            name: z.string().min(1).max(200),
            description: z.string().max(2000).optional(),
            rule_type: z.enum(["QUANTITY", "COMPANION", "CONFLICT", "CATEGORY", "BRAND"]),
            severity: z.enum(["WARN", "BLOCK", "SUGGEST"]).default("WARN"),
            target: targetSchema,
            predicate: predicateSchema,
            // Item 6 review: client surfaces are popup dialog AT submit + the
        // inline banner on the review step (the latter has more room).
        // 360 chars fits ~5 lines in the popup and ~4 in the banner — short
        // enough to stay readable, long enough for two-sentence guidance.
        message: z.string().min(1).max(360),
            is_active: z.boolean().optional().default(true),
        })
        .refine(
            (data) => {
                // v1 UI constraints — return helpful errors when admin tries
                // to insert a kind/severity the UI doesn't surface yet.
                if (
                    data.rule_type === "CONFLICT" ||
                    data.rule_type === "CATEGORY" ||
                    data.rule_type === "BRAND"
                ) {
                    return false;
                }
                if (data.severity !== "WARN") return false;
                return true;
            },
            {
                message:
                    "Only QUANTITY + COMPANION rule types with WARN severity are supported in v1. The enum accepts more for future use.",
            }
        ),
});

export const updateCommerceRuleSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).nullable().optional(),
        target: targetSchema.optional(),
        predicate: predicateSchema.optional(),
        message: z.string().min(1).max(360).optional(),
        is_active: z.boolean().optional(),
    }),
});

export const evaluateCommerceRulesSchema = z.object({
    body: z.object({
        cart: z.array(
            z.object({
                asset_id: z.string().uuid(),
                family_id: z.string().uuid().nullable().optional(),
                quantity: z.number().int().positive(),
            })
        ),
    }),
});

export type CreateCommerceRulePayload = z.infer<typeof createCommerceRuleSchema>["body"];
export type UpdateCommerceRulePayload = z.infer<typeof updateCommerceRuleSchema>["body"];
export type EvaluateCommerceRulesPayload = z.infer<typeof evaluateCommerceRulesSchema>["body"];

export const CommerceRulesSchemas = {
    createCommerceRuleSchema,
    updateCommerceRuleSchema,
    evaluateCommerceRulesSchema,
};
