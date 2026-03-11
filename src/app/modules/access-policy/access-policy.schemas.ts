import z from "zod";
import { userRoleEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const accessPolicyBody = z
    .object({
        code: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional().nullable(),
        role: z.enum(
            userRoleEnum.enumValues,
            enumMessageGenerator("Role", userRoleEnum.enumValues)
        ),
        permissions: z.array(z.string()).default([]),
        is_active: z.boolean().optional().default(true),
    })
    .strict();

const createAccessPolicySchema = z.object({ body: accessPolicyBody });
const updateAccessPolicySchema = z.object({
    body: accessPolicyBody.partial().strict(),
});

export const AccessPolicySchemas = {
    createAccessPolicySchema,
    updateAccessPolicySchema,
};
