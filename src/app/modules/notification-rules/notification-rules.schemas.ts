import z from "zod";

const listRulesQuerySchema = z.object({
    event_type: z.string().min(1).optional(),
    company_id: z.union([z.uuid(), z.literal("null")]).optional(),
});

const createRuleSchema = z.object({
    body: z
        .object({
            event_type: z.string().min(1, "event_type is required"),
            recipient_type: z.enum(["ROLE", "ENTITY_OWNER", "EMAIL"], {
                message: "recipient_type must be ROLE, ENTITY_OWNER, or EMAIL",
            }),
            recipient_value: z.string().optional().nullable(),
            template_key: z.string().min(1, "template_key is required"),
            company_id: z.uuid().optional().nullable(),
            sort_order: z.number().int().min(0).optional().default(0),
            is_enabled: z.boolean().optional().default(true),
        })
        .superRefine((data, ctx) => {
            if (data.recipient_type === "ROLE") {
                if (
                    !data.recipient_value ||
                    !["ADMIN", "LOGISTICS"].includes(data.recipient_value)
                ) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "ROLE recipient_value must be ADMIN or LOGISTICS",
                        path: ["recipient_value"],
                    });
                }
            }

            if (data.recipient_type === "ENTITY_OWNER" && data.recipient_value) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "ENTITY_OWNER recipient_value must be empty",
                    path: ["recipient_value"],
                });
            }

            if (data.recipient_type === "EMAIL") {
                const emailSchema = z.email();
                const parsed = emailSchema.safeParse(data.recipient_value ?? "");
                if (!parsed.success) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: "EMAIL recipient_value must be a valid email address",
                        path: ["recipient_value"],
                    });
                }
            }
        }),
});

const updateRuleSchema = z.object({
    body: z
        .object({
            is_enabled: z.boolean().optional(),
            template_key: z.string().min(1).optional(),
            sort_order: z.number().int().min(0).optional(),
        })
        .strict(),
});

const ruleIdParamsSchema = z.object({
    id: z.uuid(),
});

const resetEventTypeParamsSchema = z.object({
    event_type: z.string().min(1),
});

const resetEventTypeQuerySchema = z.object({
    company_id: z.union([z.uuid(), z.literal("null")]).optional(),
});

export const NotificationRuleSchemas = {
    listRulesQuerySchema,
    createRuleSchema,
    updateRuleSchema,
    ruleIdParamsSchema,
    resetEventTypeParamsSchema,
    resetEventTypeQuerySchema,
};
