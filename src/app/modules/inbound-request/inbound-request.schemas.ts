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
    quantity: z.number().int().min(1).default(1),
    packaging: z.string().optional().or(z.literal("")),
    weight_per_unit: z.number().min(0, "Weight must be positive"),
    dimensions: z.object({
        length: z.number().min(0).default(0),
        width: z.number().min(0).default(0),
        height: z.number().min(0).default(0),
    }).optional(),
    volume_per_unit: z.number().min(0, "Volume must be positive"),
    handling_tags: z.array(z.string()).optional()
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

export const inboundRequestSchemas = {
    createInboundRequestSchema,
};
