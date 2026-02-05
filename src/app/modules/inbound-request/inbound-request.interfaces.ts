import z from "zod";
import { inboundRequestSchemas } from "./inbound-request.schemas";

export type InboundRequestPayload = z.infer<typeof inboundRequestSchemas.createInboundRequestSchema>["body"];
