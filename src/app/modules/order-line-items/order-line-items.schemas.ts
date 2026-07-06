import z from "zod";
import { invoiceTypeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const billingModeSchema = z.enum(["BILLABLE", "NON_BILLABLE", "COMPLIMENTARY"], {
    message: "Invalid billing mode",
});

const logisticsVisibleSchema = z.boolean().optional();

// Per-line SELL price override (per-unit). Nullable so callers can express
// "clear the override, fall back to margin math" via explicit null.
// ADMIN-only — enforced at the service layer (route gates custom-create to
// ADMIN; update has an explicit LOGISTICS guard).
const sellUnitRateSchema = z.number().min(0).nullable().optional();

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
            logistics_visible: logisticsVisibleSchema,
            // Per-line SELL override at create time — kills the admin
            // create-then-PUT hack. ADMIN-only (guarded at the service layer;
            // LOGISTICS catalog-create rejects a supplied value).
            sell_unit_rate: sellUnitRateSchema,
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
            logistics_visible: logisticsVisibleSchema,
            sell_unit_rate: sellUnitRateSchema,
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
            logistics_visible: logisticsVisibleSchema,
            sell_unit_rate: sellUnitRateSchema,
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

// Visibility patch — single line. Accepts both audience flags so the
// audience chip's popover saves once. At least one must be present.
const patchLineItemVisibilitySchema = z.object({
    body: z
        .object({
            client_price_visible: z
                .boolean({ message: "client_price_visible must be a boolean" })
                .optional(),
            logistics_visible: z
                .boolean({ message: "logistics_visible must be a boolean" })
                .optional(),
        })
        .refine(
            (d) => d.client_price_visible !== undefined || d.logistics_visible !== undefined,
            "At least one of client_price_visible or logistics_visible is required"
        )
        .strict(),
});

const patchEntityLineItemsVisibilitySchema = z.object({
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
            client_price_visible: z.boolean().optional(),
            logistics_visible: z.boolean().optional(),
            line_item_ids: z.array(z.uuid("Invalid line item id")).optional(),
        })
        .refine((data) => {
            if (data.purpose_type === "ORDER" && !data.order_id) return false;
            if (data.purpose_type === "INBOUND_REQUEST" && !data.inbound_request_id) return false;
            if (data.purpose_type === "SERVICE_REQUEST" && !data.service_request_id) return false;
            if (data.purpose_type === "SELF_PICKUP" && !data.self_pickup_id) return false;
            return true;
        }, "Parent entity ID is required matching the purpose_type (order_id / inbound_request_id / service_request_id / self_pickup_id)")
        .refine(
            (d) => d.client_price_visible !== undefined || d.logistics_visible !== undefined,
            "At least one of client_price_visible or logistics_visible is required"
        )
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

// Bulk-margin: stamp an explicit per-line sell rate on every BILLABLE,
// non-SYSTEM, non-voided line of one entity — sell = ROUND(unit_rate ×
// (1 + margin_percent/100), 2). Replaces the retired blanket margin override
// with a one-time per-line stamp (PLAN R3/R4). ADMIN-only. `entity_id` is the
// generic parent id resolved by purpose_type. margin_percent is a markup over
// buy (0 = pass-through sell=buy); capped to keep decimal(10,2) safe.
const bulkMarginSchema = z.object({
    body: z
        .object({
            purpose_type: z.enum(
                invoiceTypeEnum.enumValues,
                enumMessageGenerator("Purpose type", invoiceTypeEnum.enumValues)
            ),
            entity_id: z.uuid("Invalid entity ID"),
            margin_percent: z
                .number({ message: "Margin percent must be a number" })
                .min(0, "Margin percent must be 0 or greater")
                .max(1000, "Margin percent must be 1000 or less"),
            reason: z.string().max(1000).optional(),
        })
        .strict(),
});

export const LineItemsSchemas = {
    createCatalogLineItemSchema,
    createCustomLineItemSchema,
    updateLineItemSchema,
    patchLineItemMetadataSchema,
    patchLineItemVisibilitySchema,
    patchEntityLineItemsVisibilitySchema,
    voidLineItemSchema,
    bulkMarginSchema,
};
