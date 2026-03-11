import z from "zod";
import { AttachmentTypesSchemas } from "./attachment-types.schemas";

export type CreateAttachmentTypePayload = z.infer<
    typeof AttachmentTypesSchemas.createAttachmentTypeSchema
>["body"];
export type UpdateAttachmentTypePayload = z.infer<
    typeof AttachmentTypesSchemas.updateAttachmentTypeSchema
>["body"];
