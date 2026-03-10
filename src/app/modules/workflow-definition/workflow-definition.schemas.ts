import z from "zod";
import { workflowRequestEntityTypeEnum, userRoleEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const workflowDefinitionBody = z
    .object({
        label: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional().nullable(),
        allowed_entity_types: z
            .array(
                z.enum(
                    workflowRequestEntityTypeEnum.enumValues,
                    enumMessageGenerator(
                        "Allowed entity type",
                        workflowRequestEntityTypeEnum.enumValues
                    )
                )
            )
            .min(1, "At least one entity type is required"),
        requester_roles: z
            .array(
                z.enum(
                    userRoleEnum.enumValues,
                    enumMessageGenerator("Requester role", userRoleEnum.enumValues)
                )
            )
            .min(1, "At least one requester role is required"),
        is_active: z.boolean().optional(),
        sort_order: z.number().int().optional(),
    })
    .strict();

const companyOverrideBody = z.object({
    overrides: z
        .array(
            z
                .object({
                    company_id: z.uuid("Company ID must be a valid UUID"),
                    is_enabled: z.boolean(),
                })
                .strict()
        )
        .default([]),
});

export const WorkflowDefinitionSchemas = {
    updateWorkflowDefinitionSchema: z.object({ body: workflowDefinitionBody.partial().strict() }),
    replaceCompanyOverridesSchema: z.object({ body: companyOverrideBody }),
};
