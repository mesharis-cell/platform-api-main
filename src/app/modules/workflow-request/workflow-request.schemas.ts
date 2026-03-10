import z from "zod";

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

const createWorkflowRequestSchema = z.object({
    body: z
        .object({
            workflow_code: z.string().trim().min(1).max(64),
            title: z.string().trim().min(1).max(200),
            description: z.string().trim().max(2000).optional(),
            metadata: z.record(z.string(), z.unknown()).optional().default({}),
            attachments: z.array(attachmentInputSchema).optional().default([]),
        })
        .strict(),
});

const updateWorkflowRequestSchema = z.object({
    body: z
        .object({
            status: z.string().trim().min(1).max(64).optional(),
            title: z.string().trim().min(1).max(200).optional(),
            description: z.string().trim().max(2000).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .strict(),
});

export const WorkflowRequestSchemas = {
    createWorkflowRequestSchema,
    updateWorkflowRequestSchema,
};
