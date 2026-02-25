import { z } from "zod";
import { trackingMethodEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const inboundRequestItemSchema = z.object({
    brand_id: z.uuid().optional().or(z.literal("")),
    name: z.string({ message: "Item name is required" }).min(1, "Item name is required"),
    description: z.string().optional().or(z.literal("")),
    category: z.string({ message: "Category is required" }).min(1, "Category is required"),
    tracking_method: z.enum(trackingMethodEnum.enumValues, {
        message: enumMessageGenerator("Tracking method", trackingMethodEnum.enumValues),
    }),
    quantity: z
        .number("Quantity should be a number")
        .int()
        .min(1, "Quantity must be at least 1")
        .default(1),
    packaging: z.string().optional().or(z.literal("")),
    weight_per_unit: z
        .number("Weight per unit should be a number")
        .min(0, "Weight must be positive")
        .optional()
        .default(0),
    volume_per_unit: z
        .number("Volume per unit should be a number")
        .min(0, "Volume must be positive")
        .optional()
        .default(0),
    dimensions: z
        .object({
            length: z.number("Length should be a number").min(0).default(0),
            width: z.number("Width should be a number").min(0).default(0),
            height: z.number("Height should be a number").min(0).default(0),
        })
        .optional(),
    images: z.array(z.string()).optional(),
    handling_tags: z.array(z.string()).optional(),
    id: z.uuid().optional(),
});

const createInboundRequestSchema = z.object({
    body: z.object({
        company_id: z.uuid().optional().or(z.literal("")),
        note: z.string().optional().or(z.literal("")),
        incoming_at: z
            .string("Incoming date is required")
            .refine((date) => !isNaN(Date.parse(date)), "Invalid incoming date format"),
        items: z.array(inboundRequestItemSchema).min(1, "At least one item is required"),
    }),
});

const approveInboundRequestSchema = z.object({
    body: z
        .object({
            margin_override_percent: z
                .number("Margin override percent should be a number")
                .min(0, "Margin override percent must be greater than 0")
                .max(100, "Margin override percent must be less than 100")
                .optional(),
            margin_override_reason: z.string("Margin override reason should be a text").optional(),
        })
        .strict(),
});

const approveOrDeclineQuoteByClientSchema = z.object({
    body: z
        .object({
            status: z.enum(
                ["CONFIRMED", "DECLINED"],
                enumMessageGenerator("Status", ["CONFIRMED", "DECLINED"])
            ),
            note: z.string("Notes should be a text").optional(),
        })
        .strict(),
});

const inboundRequestItemUpdateShape = z
    .object({
        asset_id: z.uuid("Asset ID should be a valid UUID").optional(),
        item_id: z.uuid({ message: "Item ID is required" }).optional(),
        brand_id: z.uuid().optional().nullable(),
        name: z
            .string({ message: "Item name is required" })
            .min(1, "Item name is required")
            .optional(),
        description: z.string().optional().nullable(),
        category: z
            .string({ message: "Category is required" })
            .min(1, "Category is required")
            .optional(),
        tracking_method: z
            .enum(trackingMethodEnum.enumValues, {
                message: enumMessageGenerator("Tracking method", trackingMethodEnum.enumValues),
            })
            .optional(),
        quantity: z
            .number("Quantity should be a number")
            .int()
            .min(1, "Quantity must be at least 1")
            .optional(),
        packaging: z.string().optional().nullable(),
        weight_per_unit: z
            .number("Weight per unit should be a number")
            .min(0, "Weight must be positive")
            .optional(),
        volume_per_unit: z
            .number("Volume per unit should be a number")
            .min(0, "Volume must be positive")
            .optional(),
        dimensions: z
            .object({
                length: z.number("Length should be a number").min(0).optional(),
                width: z.number("Width should be a number").min(0).optional(),
                height: z.number("Height should be a number").min(0).optional(),
            })
            .optional(),
        images: z.array(z.string()).optional(),
        handling_tags: z.array(z.string()).optional(),
    })
    .superRefine((data, ctx) => {
        if ((!data.asset_id || !data.item_id) && !data.name) {
            ctx.addIssue({
                code: "custom",
                message: "Asset name is required for new assets",
            });
        }

        if ((!data.asset_id || !data.item_id) && !data.quantity) {
            ctx.addIssue({
                code: "custom",
                message: "Asset quantity is required",
            });
        }
    })
    .strict();

const updateInboundRequestItemSchema = z.object({
    body: inboundRequestItemUpdateShape,
});

const updateInboundRequestSchema = z.object({
    body: z
        .object({
            note: z.string().optional().or(z.literal("")),
            incoming_at: z
                .string("Incoming date is required")
                .refine((date) => !isNaN(Date.parse(date)), "Invalid incoming date format")
                .optional(),
            items: z
                .array(inboundRequestItemUpdateShape)
                .min(1, "At least one item is required")
                .optional(),
        })
        .strict(),
});

const completeInboundRequestSchema = z.object({
    body: z
        .object({
            warehouse_id: z.uuid({ message: "Warehouse ID is required" }),
            zone_id: z.uuid({ message: "Zone ID is required" }),
        })
        .strict(),
});

const cancelInboundRequestSchema = z.object({
    body: z
        .object({
            note: z.string("Notes should be a text").optional(),
        })
        .strict(),
});

export const inboundRequestSchemas = {
    createInboundRequestSchema,
    approveInboundRequestSchema,
    approveOrDeclineQuoteByClientSchema,
    updateInboundRequestItemSchema,
    completeInboundRequestSchema,
    cancelInboundRequestSchema,
    updateInboundRequestSchema,
};
