import z from "zod";
import { ServiceRequestSchemas } from "./service-request.schemas";

export type CreateServiceRequestPayload = z.infer<
    typeof ServiceRequestSchemas.createServiceRequestSchema
>["body"];

export type UpdateServiceRequestPayload = z.infer<
    typeof ServiceRequestSchemas.updateServiceRequestSchema
>["body"];

export type UpdateServiceRequestStatusPayload = z.infer<
    typeof ServiceRequestSchemas.updateServiceRequestStatusSchema
>["body"];

export type CancelServiceRequestPayload = z.infer<
    typeof ServiceRequestSchemas.cancelServiceRequestSchema
>["body"];

export type UpdateServiceRequestCommercialStatusPayload = z.infer<
    typeof ServiceRequestSchemas.updateServiceRequestCommercialStatusSchema
>["body"];

export type ApproveServiceRequestQuotePayload = z.infer<
    typeof ServiceRequestSchemas.approveServiceRequestQuoteSchema
>["body"];
