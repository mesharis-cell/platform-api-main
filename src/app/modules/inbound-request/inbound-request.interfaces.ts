import z from "zod";
import { inboundRequestSchemas } from "./inbound-request.schemas";

export type InboundRequestPayload = z.infer<typeof inboundRequestSchemas.createInboundRequestSchema>["body"];

export type ApproveInboundRequestPayload = z.infer<typeof inboundRequestSchemas.approveInboundRequestSchema>["body"];

export type ApproveOrDeclineQuoteByClientPayload = z.infer<typeof inboundRequestSchemas.approveOrDeclineQuoteByClientSchema>["body"];

export type UpdateInboundRequestItemPayload = z.infer<typeof inboundRequestSchemas.updateInboundRequestItemSchema>["body"];
