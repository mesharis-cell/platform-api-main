import z from "zod";
import { WorkflowRequestSchemas } from "./workflow-request.schemas";

export type CreateWorkflowRequestPayload = z.infer<
    typeof WorkflowRequestSchemas.createWorkflowRequestSchema
>["body"];
export type UpdateWorkflowRequestPayload = z.infer<
    typeof WorkflowRequestSchemas.updateWorkflowRequestSchema
>["body"];
