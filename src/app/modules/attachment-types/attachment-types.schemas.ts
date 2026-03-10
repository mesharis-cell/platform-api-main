import z from "zod";
import { attachmentEntityTypeEnum, userRoleEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const attachmentTypeBody = z
    .object({
        code: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(120),
        allowed_entity_types: z
            .array(
                z.enum(
                    attachmentEntityTypeEnum.enumValues,
                    enumMessageGenerator("Allowed entity type", attachmentEntityTypeEnum.enumValues)
                )
            )
            .min(1, "At least one entity type is required"),
        upload_roles: z
            .array(
                z.enum(
                    userRoleEnum.enumValues,
                    enumMessageGenerator("Upload role", userRoleEnum.enumValues)
                )
            )
            .min(1, "At least one upload role is required"),
        view_roles: z
            .array(
                z.enum(
                    userRoleEnum.enumValues,
                    enumMessageGenerator("View role", userRoleEnum.enumValues)
                )
            )
            .optional(),
        default_visible_to_client: z.boolean().optional().default(false),
        is_active: z.boolean().optional().default(true),
        sort_order: z.number().int().optional().default(0),
    })
    .strict();

const createAttachmentTypeSchema = z.object({ body: attachmentTypeBody });
const updateAttachmentTypeSchema = z.object({ body: attachmentTypeBody.partial().strict() });

export const AttachmentTypesSchemas = {
    createAttachmentTypeSchema,
    updateAttachmentTypeSchema,
};
