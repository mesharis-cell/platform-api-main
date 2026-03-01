import z from "zod";
import { billingModeEnum, invoiceTypeEnum, serviceCategoryEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const requestBodyBase = z.object({
    purpose_type: z.enum(
        invoiceTypeEnum.enumValues,
        enumMessageGenerator("Purpose type", invoiceTypeEnum.enumValues)
    ),
    order_id: z.uuid("Invalid order ID").optional(),
    inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
    service_request_id: z.uuid("Invalid service request ID").optional(),
    description: z.string().trim().min(1).max(200),
    category: z.enum(
        serviceCategoryEnum.enumValues,
        enumMessageGenerator("Category", serviceCategoryEnum.enumValues)
    ),
    quantity: z.number().positive(),
    unit: z.string().trim().min(1).max(20),
    unit_rate: z.number().min(0),
    notes: z.string().trim().optional(),
});

const createLineItemRequestSchema = z.object({
    body: requestBodyBase
        .refine((data) => {
            if (data.purpose_type === "ORDER") return !!data.order_id;
            if (data.purpose_type === "INBOUND_REQUEST") return !!data.inbound_request_id;
            if (data.purpose_type === "SERVICE_REQUEST") return !!data.service_request_id;
            return false;
        }, "order_id, inbound_request_id, or service_request_id is required based on purpose_type")
        .strict(),
});

const approveLineItemRequestSchema = z.object({
    body: z
        .object({
            description: z.string().trim().min(1).max(200).optional(),
            category: z
                .enum(
                    serviceCategoryEnum.enumValues,
                    enumMessageGenerator("Category", serviceCategoryEnum.enumValues)
                )
                .optional(),
            quantity: z.number().positive().optional(),
            unit: z.string().trim().min(1).max(20).optional(),
            unit_rate: z.number().min(0).optional(),
            notes: z.string().trim().optional(),
            billing_mode: z
                .enum(
                    billingModeEnum.enumValues,
                    enumMessageGenerator("Billing mode", billingModeEnum.enumValues)
                )
                .optional()
                .default("BILLABLE"),
            admin_note: z.string().trim().optional(),
        })
        .strict(),
});

const rejectLineItemRequestSchema = z.object({
    body: z
        .object({
            admin_note: z.string().trim().min(1, "Rejection reason is required"),
        })
        .strict(),
});

export const LineItemRequestsSchemas = {
    createLineItemRequestSchema,
    approveLineItemRequestSchema,
    rejectLineItemRequestSchema,
};
