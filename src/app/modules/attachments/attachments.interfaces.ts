import z from "zod";
import { AttachmentsSchemas } from "./attachments.schemas";

export type CreateEntityAttachmentsPayload = z.infer<
    typeof AttachmentsSchemas.createEntityAttachmentsSchema
>["body"];

export type CreateWorkflowAttachmentsPayload = z.infer<
    typeof AttachmentsSchemas.createWorkflowAttachmentsSchema
>["body"];
