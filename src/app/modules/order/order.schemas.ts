import { z } from "zod";

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

export const orderSchemas = {
    submitOrderSchema,
};
