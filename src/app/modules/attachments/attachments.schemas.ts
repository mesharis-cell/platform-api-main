import z from "zod";
import { attachmentEntityTypeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const attachmentInputSchema = z
    .object({
        attachment_type_id: z.uuid("Invalid attachment type id"),
        file_url: z.string().url("Invalid file URL"),
        file_name: z.string().trim().min(1).max(255),
        mime_type: z.string().trim().min(1).max(255),
        file_size_bytes: z.number().int().nonnegative().optional(),
        note: z.string().trim().max(1000).optional(),
        visible_to_client: z.boolean().optional(),
    })
    .strict();

const createEntityAttachmentsSchema = z.object({
    body: z
        .object({
            attachments: z
                .array(attachmentInputSchema)
                .min(1, "At least one attachment is required"),
        })
        .strict(),
});

const createWorkflowAttachmentsSchema = z.object({
    body: z
        .object({
            entity_type: z.enum(
                attachmentEntityTypeEnum.enumValues,
                enumMessageGenerator("Entity type", attachmentEntityTypeEnum.enumValues)
            ),
            entity_id: z.uuid("Invalid entity id"),
            attachments: z
                .array(attachmentInputSchema)
                .min(1, "At least one attachment is required"),
        })
        .strict(),
});

export const AttachmentsSchemas = {
    createEntityAttachmentsSchema,
    createWorkflowAttachmentsSchema,
};
