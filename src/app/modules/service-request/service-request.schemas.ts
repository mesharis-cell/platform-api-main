import z from "zod";
import {
    serviceRequestBillingModeEnum,
    serviceRequestCommercialStatusEnum,
    serviceRequestStatusEnum,
    serviceRequestTypeEnum,
} from "../../../db/schema";

const serviceRequestItemSchema = z.object({
    asset_id: z.string().uuid("Invalid asset ID").optional(),
    asset_name: z
        .string({ message: "Asset name is required" })
        .min(1, "Asset name is required")
        .max(200, "Asset name must be under 200 characters"),
    quantity: z.number().int().positive("Quantity must be greater than 0").default(1),
    notes: z.string().max(1000, "Notes must be under 1000 characters").optional(),
    refurb_days_estimate: z.number().int().min(0).max(365).optional(),
});

const createServiceRequestSchema = z.object({
    body: z
        .object({
            company_id: z.string().uuid("Invalid company ID"),
            request_type: z.enum(serviceRequestTypeEnum.enumValues),
            billing_mode: z.enum(serviceRequestBillingModeEnum.enumValues).default("INTERNAL_ONLY"),
            title: z
                .string({ message: "Title is required" })
                .min(1, "Title is required")
                .max(200, "Title must be under 200 characters"),
            description: z
                .string()
                .max(5000, "Description must be under 5000 characters")
                .optional(),
            related_asset_id: z.string().uuid("Invalid related asset ID").optional(),
            related_order_id: z.string().uuid("Invalid related order ID").optional(),
            related_order_item_id: z.string().uuid("Invalid related order item ID").optional(),
            requested_start_at: z.string().datetime().optional(),
            requested_due_at: z.string().datetime().optional(),
            items: z.array(serviceRequestItemSchema).min(1, "At least one item is required"),
        })
        .strict(),
});

const updateServiceRequestSchema = z.object({
    body: z
        .object({
            billing_mode: z.enum(serviceRequestBillingModeEnum.enumValues).optional(),
            title: z.string().min(1).max(200).optional(),
            description: z.string().max(5000).optional(),
            related_asset_id: z.string().uuid().optional().nullable(),
            requested_start_at: z.string().datetime().optional().nullable(),
            requested_due_at: z.string().datetime().optional().nullable(),
            items: z.array(serviceRequestItemSchema).min(1).optional(),
        })
        .strict(),
});

const updateServiceRequestStatusSchema = z.object({
    body: z
        .object({
            to_status: z.enum(serviceRequestStatusEnum.enumValues),
            note: z.string().max(1000).optional(),
            completion_notes: z.string().max(2000).optional(),
        })
        .strict(),
});

const cancelServiceRequestSchema = z.object({
    body: z
        .object({
            cancellation_reason: z
                .string({ message: "Cancellation reason is required" })
                .min(10, "Cancellation reason must be at least 10 characters")
                .max(2000, "Cancellation reason must be under 2000 characters"),
        })
        .strict(),
});

const updateServiceRequestCommercialStatusSchema = z.object({
    body: z
        .object({
            commercial_status: z.enum(serviceRequestCommercialStatusEnum.enumValues),
            note: z.string().max(1000).optional(),
        })
        .strict(),
});

const approveServiceRequestQuoteSchema = z.object({
    body: z
        .object({
            note: z.string().max(1000).optional(),
        })
        .strict(),
});

export const ServiceRequestSchemas = {
    createServiceRequestSchema,
    updateServiceRequestSchema,
    updateServiceRequestStatusSchema,
    cancelServiceRequestSchema,
    updateServiceRequestCommercialStatusSchema,
    approveServiceRequestQuoteSchema,
};
