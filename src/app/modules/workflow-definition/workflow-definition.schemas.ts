import z from "zod";
import { workflowRequestEntityTypeEnum, userRoleEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";
import {
    listWorkflowFamilyOptions,
    listWorkflowStatusModelOptions,
} from "../../utils/workflow-catalog";

const workflowFamilyValues = listWorkflowFamilyOptions().map((item) => item.key) as [
    string,
    ...string[],
];
const workflowStatusModelValues = listWorkflowStatusModelOptions().map((item) => item.key) as [
    string,
    ...string[],
];

const workflowDefinitionBody = z
    .object({
        code: z
            .string()
            .trim()
            .min(2)
            .max(64)
            .regex(/^[A-Z0-9_]+$/, "Code must use uppercase letters, numbers, and underscores"),
        label: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional().nullable(),
        workflow_family: z.enum(workflowFamilyValues, {
            message: "Workflow family is invalid",
        }),
        status_model_key: z.enum(workflowStatusModelValues, {
            message: "Workflow status model is invalid",
        }),
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
        viewer_roles: z
            .array(
                z.enum(
                    userRoleEnum.enumValues,
                    enumMessageGenerator("Viewer role", userRoleEnum.enumValues)
                )
            )
            .min(1, "At least one viewer role is required"),
        actor_roles: z
            .array(
                z.enum(
                    userRoleEnum.enumValues,
                    enumMessageGenerator("Actor role", userRoleEnum.enumValues)
                )
            )
            .min(1, "At least one actor role is required"),
        priority_enabled: z.boolean().optional(),
        sla_hours: z.number().int().positive().optional().nullable(),
        blocks_fulfillment_default: z.boolean().optional(),
        intake_schema: z.record(z.string(), z.unknown()).optional(),
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
                    label_override: z.string().trim().max(120).optional().nullable(),
                    sort_order_override: z.number().int().optional().nullable(),
                })
                .strict()
        )
        .default([]),
});

export const WorkflowDefinitionSchemas = {
    createWorkflowDefinitionSchema: z.object({ body: workflowDefinitionBody }),
    updateWorkflowDefinitionSchema: z.object({ body: workflowDefinitionBody.partial().strict() }),
    replaceCompanyOverridesSchema: z.object({ body: companyOverrideBody }),
};
