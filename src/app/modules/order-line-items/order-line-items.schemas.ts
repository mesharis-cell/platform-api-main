import z from "zod";
import { invoiceTypeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const billingModeSchema = z.enum(["BILLABLE", "NON_BILLABLE", "COMPLIMENTARY"], {
    message: "Invalid billing mode",
});

const createCatalogLineItemSchema = z.object({
    body: z
        .object({
            order_id: z.uuid("Invalid order ID").optional(),
            inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
            service_request_id: z.uuid("Invalid service request ID").optional(),
            self_pickup_id: z.uuid("Invalid self-pickup ID").optional(),
            purpose_type: z.enum(
                invoiceTypeEnum.enumValues,
                enumMessageGenerator("Purpose type", invoiceTypeEnum.enumValues)
            ),
            service_type_id: z.uuid("Invalid service type ID"),
            quantity: z
                .number({ message: "Quantity must be a number" })
                .positive("Quantity must be greater than 0"),
            notes: z.string().optional(),
            billing_mode: billingModeSchema.optional().default("BILLABLE"),
            metadata: z.record(z.string(), z.unknown()).optional().default({}),
            client_price_visible: z.boolean().optional().default(false),
        })
        .refine((data) => {
            if (data.purpose_type === "ORDER" && !data.order_id) {
                return false;
            }
            if (data.purpose_type === "INBOUND_REQUEST" && !data.inbound_request_id) {
                return false;
            }
            if (data.purpose_type === "SERVICE_REQUEST" && !data.service_request_id) {
                return false;
            }
            if (data.purpose_type === "SELF_PICKUP" && !data.self_pickup_id) {
                return false;
            }
            return true;
        }, "Parent entity ID is required matching the purpose_type (order_id / inbound_request_id / service_request_id / self_pickup_id)")
        .strict(),
});

const createCustomLineItemSchema = z.object({
    body: z
        .object({
            order_id: z.uuid("Invalid order ID").optional(),
            inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
            service_request_id: z.uuid("Invalid service request ID").optional(),
            self_pickup_id: z.uuid("Invalid self-pickup ID").optional(),
            purpose_type: z.enum(
                invoiceTypeEnum.enumValues,
                enumMessageGenerator("Purpose type", invoiceTypeEnum.enumValues)
            ),
            description: z
                .string({ message: "Description is required" })
                .min(1, "Description is required")
                .max(200, "Description must be under 200 characters"),
            category: z.enum(
                ["ASSEMBLY", "EQUIPMENT", "HANDLING", "RESKIN", "TRANSPORT", "OTHER"],
                {
                    message: "Invalid category",
                }
            ),
            quantity: z
                .number({ message: "Quantity must be a number" })
                .positive("Quantity must be greater than 0"),
            unit: z
                .string({ message: "Unit is required" })
                .min(1, "Unit is required")
                .max(20, "Unit must be under 20 characters"),
            unit_rate: z
                .number({ message: "Unit rate must be a number" })
                .min(0, "Unit rate must be 0 or greater"),
            notes: z.string().optional(),
            billing_mode: billingModeSchema.optional().default("BILLABLE"),
            metadata: z.record(z.string(), z.unknown()).optional().default({}),
            client_price_visible: z.boolean().optional().default(false),
        })
        .refine((data) => {
            if (data.purpose_type === "ORDER" && !data.order_id) return false;
            if (data.purpose_type === "INBOUND_REQUEST" && !data.inbound_request_id) return false;
            if (data.purpose_type === "SERVICE_REQUEST" && !data.service_request_id) return false;
            if (data.purpose_type === "SELF_PICKUP" && !data.self_pickup_id) return false;
            return true;
        }, "Parent entity ID is required matching the purpose_type (order_id / inbound_request_id / service_request_id / self_pickup_id)")
        .strict(),
});

const updateLineItemSchema = z.object({
    body: z
        .object({
            quantity: z.number().positive().optional(),
            unit: z.string().min(1).max(20).optional(),
            unit_rate: z.number().min(0).optional(),
            notes: z.string().optional(),
            billing_mode: billingModeSchema.optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
            client_price_visible: z.boolean().optional(),
        })
        .strict(),
});

const patchLineItemMetadataSchema = z.object({
    body: z
        .object({
            notes: z.string().optional(),
            metadata: z.record(z.string(), z.unknown()).optional().default({}),
        })
        .strict(),
});

const patchLineItemClientVisibilitySchema = z.object({
    body: z
        .object({
            client_price_visible: z.boolean({
                message: "client_price_visible must be a boolean",
            }),
        })
        .strict(),
});

const patchEntityLineItemsClientVisibilitySchema = z.object({
    body: z
        .object({
            purpose_type: z.enum(
                invoiceTypeEnum.enumValues,
                enumMessageGenerator("Purpose type", invoiceTypeEnum.enumValues)
            ),
            order_id: z.uuid("Invalid order ID").optional(),
            inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
            service_request_id: z.uuid("Invalid service request ID").optional(),
            self_pickup_id: z.uuid("Invalid self-pickup ID").optional(),
            client_price_visible: z.boolean({
                message: "client_price_visible must be a boolean",
            }),
            line_item_ids: z.array(z.uuid("Invalid line item id")).optional(),
        })
        .refine((data) => {
            if (data.purpose_type === "ORDER" && !data.order_id) return false;
            if (data.purpose_type === "INBOUND_REQUEST" && !data.inbound_request_id) return false;
            if (data.purpose_type === "SERVICE_REQUEST" && !data.service_request_id) return false;
            if (data.purpose_type === "SELF_PICKUP" && !data.self_pickup_id) return false;
            return true;
        }, "Parent entity ID is required matching the purpose_type (order_id / inbound_request_id / service_request_id / self_pickup_id)")
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

export const LineItemsSchemas = {
    createCatalogLineItemSchema,
    createCustomLineItemSchema,
    updateLineItemSchema,
    patchLineItemMetadataSchema,
    patchLineItemClientVisibilitySchema,
    patchEntityLineItemsClientVisibilitySchema,
    voidLineItemSchema,
};
