import z from "zod";
import { inboundRequestSchemas } from "./inbound-request.schemas";

export type InboundRequestPayload = z.infer<typeof inboundRequestSchemas.createInboundRequestSchema>["body"];

export type ApproveInboundRequestPayload = z.infer<typeof inboundRequestSchemas.approveInboundRequestSchema>["body"];
