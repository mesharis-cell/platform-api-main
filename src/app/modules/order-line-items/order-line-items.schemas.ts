import z from "zod";
import { invoiceTypeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const billingModeSchema = z.enum(["BILLABLE", "NON_BILLABLE", "COMPLIMENTARY"], {
    message: "Invalid billing mode",
});

const transportMetadataSchema = z
    .object({
        truck_plate: z.string().max(80).optional(),
        driver_name: z.string().max(120).optional(),
        driver_contact: z.string().max(80).optional(),
        truck_size: z.string().max(80).optional(),
        tailgate_required: z.boolean().optional(),
        manpower: z.number().int().min(0).optional(),
        city_id: z.string().uuid().optional(),
        city_name: z.string().optional(),
        vehicle_type_id: z.string().uuid().optional(),
        vehicle_type_name: z.string().optional(),
        trip_direction: z.enum(["DELIVERY", "PICKUP", "ACCESS", "TRANSFER"]).optional(),
        delivery_notes: z.string().optional(),
        pickup_notes: z.string().optional(),
        notes: z.string().optional(),
    })
    .passthrough();

const createCatalogLineItemSchema = z.object({
    body: z
        .object({
            order_id: z.uuid("Invalid order ID").optional(),
            inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
            service_request_id: z.uuid("Invalid service request ID").optional(),
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
            return true;
        }, "Order ID is required for ORDER, inbound request ID for INBOUND_REQUEST, and service request ID for SERVICE_REQUEST purpose type")
        .strict(),
});

const createCustomLineItemSchema = z.object({
    body: z
        .object({
            order_id: z.uuid("Invalid order ID").optional(),
            inbound_request_id: z.uuid("Invalid inbound request ID").optional(),
            service_request_id: z.uuid("Invalid service request ID").optional(),
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
        })
        .refine((data) => {
            if (data.purpose_type === "ORDER" && !data.order_id) return false;
            if (data.purpose_type === "INBOUND_REQUEST" && !data.inbound_request_id) return false;
            if (data.purpose_type === "SERVICE_REQUEST" && !data.service_request_id) return false;
            return true;
        }, "Order ID is required for ORDER, inbound request ID for INBOUND_REQUEST, and service request ID for SERVICE_REQUEST purpose type")
        .superRefine((data, ctx) => {
            if (data.category !== "TRANSPORT") return;
            const parsed = transportMetadataSchema.safeParse(data.metadata || {});
            if (parsed.success) return;
            parsed.error.issues.forEach((issue) => {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["metadata", ...(issue.path || [])],
                    message: issue.message,
                });
            });
        })
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

export const LineItemsSchemas = {
    createCatalogLineItemSchema,
    createCustomLineItemSchema,
    updateLineItemSchema,
    voidLineItemSchema,
};
