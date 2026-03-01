import z from "zod";
import { LineItemRequestsSchemas } from "./line-item-requests.schemas";

export type CreateLineItemRequestPayload = z.infer<
    typeof LineItemRequestsSchemas.createLineItemRequestSchema
>["body"] & {
    platform_id: string;
    requested_by: string;
};

export type ApproveLineItemRequestPayload = z.infer<
    typeof LineItemRequestsSchemas.approveLineItemRequestSchema
>["body"];

export type RejectLineItemRequestPayload = z.infer<
    typeof LineItemRequestsSchemas.rejectLineItemRequestSchema
>["body"];
