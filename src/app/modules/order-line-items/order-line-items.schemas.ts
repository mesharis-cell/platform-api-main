import z from "zod";
import { invoiceTypeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const createCatalogLineItemSchema = z.object({
    body: z
        .object({
            order_id: z.uuid("Invalid order ID").optional(),
            inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
            purpose_type: z.enum(invoiceTypeEnum.enumValues, enumMessageGenerator("Purpose type", invoiceTypeEnum.enumValues)),
            service_type_id: z.uuid("Invalid service type ID"),
            quantity: z
                .number({ message: "Quantity must be a number" })
                .positive("Quantity must be greater than 0"),
            notes: z.string().optional(),
        })
        .refine((data) => {
            if (data.purpose_type === "ORDER" && !data.order_id) {
                return false;
            }
            if (data.purpose_type === "INBOUND_REQUEST" && !data.inbound_request_id) {
                return false;
            }
            return true;
        }, "Order ID is required for ORDER purpose type and Inbound Request ID is required for INBOUND_REQUEST purpose type")
        .strict(),
});

const createCustomLineItemSchema = z.object({
    body: z
        .object({
            order_id: z.uuid("Invalid order ID").optional(),
            inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
            purpose_type: z.enum(invoiceTypeEnum.enumValues, enumMessageGenerator("Purpose type", invoiceTypeEnum.enumValues)),
            description: z
                .string({ message: "Description is required" })
                .min(1, "Description is required")
                .max(200, "Description must be under 200 characters"),
            category: z.enum(["ASSEMBLY", "EQUIPMENT", "HANDLING", "RESKIN", "OTHER"], {
                message: "Invalid category",
            }),
            total: z
                .number({ message: "Total must be a number" })
                .positive("Total must be greater than 0"),
            notes: z.string().optional(),
            reskin_request_id: z.string().uuid("Invalid reskin request ID").optional(),
        })
        .strict(),
});

const updateLineItemSchema = z.object({
    body: z
        .object({
            quantity: z.number().positive().optional(),
            unit_rate: z.number().min(0).optional(),
            total: z.number().positive().optional(),
            notes: z.string().optional(),
        })
        .strict(),
});

const voidLineItemSchema = z.object({
    body: z
        .object({
            void_reason: z
                .string({ message: "Void reason is required" })
                .min(10, "Void reason must be at least 10 characters"),
        })
        .strict(),
});

export const OrderLineItemsSchemas = {
    createCatalogLineItemSchema,
    createCustomLineItemSchema,
    updateLineItemSchema,
    voidLineItemSchema,
};
