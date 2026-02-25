import z from "zod";
import { inboundRequestSchemas } from "./inbound-request.schemas";

export type InboundRequestPayload = z.infer<
    typeof inboundRequestSchemas.createInboundRequestSchema
>["body"];

export type ApproveInboundRequestPayload = z.infer<
    typeof inboundRequestSchemas.approveInboundRequestSchema
>["body"];

export type ApproveOrDeclineQuoteByClientPayload = z.infer<
    typeof inboundRequestSchemas.approveOrDeclineQuoteByClientSchema
>["body"];

export type UpdateInboundRequestItemPayload = z.infer<
    typeof inboundRequestSchemas.updateInboundRequestItemSchema
>["body"];

export type CompleteInboundRequestPayload = z.infer<
    typeof inboundRequestSchemas.completeInboundRequestSchema
>["body"];

export type CancelInboundRequestPayload = z.infer<
    typeof inboundRequestSchemas.cancelInboundRequestSchema
>["body"];

export type UpdateInboundRequestPayload = z.infer<
    typeof inboundRequestSchemas.updateInboundRequestSchema
>["body"];
