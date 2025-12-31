import { z } from "zod";
import { orderStatusEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

export const orderItemSchema = z.object({
    asset_id: z.uuid("Invalid asset ID"),
    quantity: z.number("Quantity should be a number").int("Quantity should be an integer").positive("Quantity must be a positive integer"),
    from_collection_id: z.uuid("Invalid collection ID").optional(),
});

const submitOrderSchema = z.object({
    body: z.object({
        items: z
            .array(orderItemSchema, "Items should be an array of objects")
            .min(1, "At least one item is required"),

        brand_id: z.uuid("Invalid brand ID").optional(),
        event_start_date: z.string("Event start date is required").refine(
            (date) => !isNaN(Date.parse(date)),
            "Invalid event start date format"
        ),
        event_end_date: z.string("Event end date is required").refine(
            (date) => !isNaN(Date.parse(date)),
            "Invalid event end date format"
        ),
        venue_name: z.string("Venue name is required").min(1, "Venue name is required").max(200),
        venue_country: z.string("Venue country is required").min(1, "Venue country is required").max(50),
        venue_city: z.string("Venue city is required").min(1, "Venue city is required").max(50),
        venue_address: z.string("Venue address is required").min(1, "Venue address is required"),
        venue_access_notes: z.string("Venue access notes should be a text").optional(),
        contact_name: z.string("Contact name is required").min(1, "Contact name is required").max(100),
        contact_email: z.string("Contact email is required").email("Invalid email format").max(255),
        contact_phone: z.string("Contact phone is required").min(1, "Contact phone is required").max(50),
        special_instructions: z.string("Special instructions should be a text").optional(),
    }),
});

const updateJobNumberSchema = z.object({
    body: z.object({
        job_number: z
            .string()
            .max(100, "Job number must be at most 100 characters")
            .regex(/^[a-zA-Z0-9\-_]+$/, "Job number must be alphanumeric (letters, numbers, hyphens, underscores only)")
    }),
});

const progressStatusSchema = z.object({
    body: z.object({
        new_status: z.enum(orderStatusEnum.enumValues, enumMessageGenerator('New status', orderStatusEnum.enumValues)),
        notes: z.string().optional(),
    }).strict(),
});

const updateTimeWindowsSchema = z.object({
    body: z.object({
        delivery_window_start: z.string("Delivery window start date is required").refine(
            (date) => !isNaN(Date.parse(date)),
            "Invalid delivery window start date format"
        ),
        delivery_window_end: z.string("Delivery window end date is required").refine(
            (date) => !isNaN(Date.parse(date)),
            "Invalid delivery window end date format"
        ),
        pickup_window_start: z.string("Pickup window start date is required").refine(
            (date) => !isNaN(Date.parse(date)),
            "Invalid pickup window start date format"
        ),
        pickup_window_end: z.string("Pickup window end date is required").refine(
            (date) => !isNaN(Date.parse(date)),
            "Invalid pickup window end date format"
        ),
    }).strict().refine((data) => {
        const deliveryStart = new Date(data.delivery_window_start);
        const deliveryEnd = new Date(data.delivery_window_end);
        return deliveryEnd >= deliveryStart;
    }, {
        message: "Delivery window end must be after start",
        path: ["delivery_window_end"],
    }).refine((data) => {
        const pickupStart = new Date(data.pickup_window_start);
        const pickupEnd = new Date(data.pickup_window_end);
        return pickupEnd >= pickupStart;
    }, {
        message: "Pickup window end must be after start",
        path: ["pickup_window_end"],
    }),
});

const adjustLogisticsPricingSchema = z.object({
    body: z.object({
        adjusted_price: z
            .number("Adjusted price should be a number")
            .positive("Adjusted price must be greater than 0"),
        adjustment_reason: z
            .string("Adjustment reason should be a text")
            .min(10, "Adjustment reason must be at least 10 characters"),
    }).strict(),
});


export const orderSchemas = {
    submitOrderSchema,
    updateJobNumberSchema,
    progressStatusSchema,
    updateTimeWindowsSchema,
    adjustLogisticsPricingSchema,
};

