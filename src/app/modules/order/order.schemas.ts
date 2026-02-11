import { z } from "zod";
import { orderStatusEnum, tripTypeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";
import { CANCEL_REASONS } from "./order.utils";

const calculateEstimateSchema = z.object({
    body: z.object({
        items: z.array(
            z.object({
                asset_id: z.uuid("Invalid asset ID"),
                quantity: z.number().int().positive("Quantity must be positive"),
                is_reskin_request: z.boolean().optional(),
            })
        ),
        venue_city: z.string("Venue city is required"),
        trip_type: z.enum(
            tripTypeEnum.enumValues,
            enumMessageGenerator("Trip type", tripTypeEnum.enumValues)
        ),
    }).strict(),
});

export const orderItemSchema = z
    .object({
        asset_id: z.uuid("Invalid asset ID"),
        quantity: z
            .number("Quantity should be a number")
            .int("Quantity should be an integer")
            .positive("Quantity must be a positive integer"),
        from_collection_id: z.uuid("Invalid collection ID").optional(),
        is_reskin_request: z.boolean().optional().default(false),
        reskin_target_brand_id: z.uuid("Invalid brand ID").optional(),
        reskin_target_brand_custom: z
            .string()
            .max(100, "Custom brand name must be under 100 characters")
            .optional(),
        reskin_notes: z.string().min(10, "Reskin notes must be at least 10 characters").optional(),
    })
    .refine(
        (data) => {
            // If reskin requested, must have target brand and notes
            if (data.is_reskin_request) {
                return (
                    (data.reskin_target_brand_id || data.reskin_target_brand_custom) &&
                    data.reskin_notes
                );
            }
            return true;
        },
        {
            message: "Reskin requests require target brand and notes",
            path: ["is_reskin_request"],
        }
    );

const addOrderItemSchema = z.object({
    body: z.object({
        asset_id: z.string().uuid("Invalid asset ID"),
        quantity: z.number().int().positive("Quantity must be positive"),
    }),
});

const updateOrderItemQuantitySchema = z.object({
    body: z.object({
        quantity: z.number().int().positive("Quantity must be positive"),
    }),
});

const submitOrderSchema = z.object({
    body: z
        .object({
            items: z
                .array(orderItemSchema, "Items should be an array of objects")
                .min(1, "At least one item is required"),

            brand_id: z.uuid("Invalid brand ID").optional(),
            trip_type: z
                .enum(["ONE_WAY", "ROUND_TRIP"], {
                    message: "Trip type must be ONE_WAY or ROUND_TRIP",
                })
                .optional()
                .default("ROUND_TRIP"),
            event_start_date: z
                .string("Event start date is required")
                .refine((date) => !isNaN(Date.parse(date)), "Invalid event start date format")
                .transform((date) => new Date(date)),
            event_end_date: z
                .string("Event end date is required")
                .refine((date) => !isNaN(Date.parse(date)), "Invalid event end date format")
                .transform((date) => new Date(date)),
            venue_name: z
                .string("Venue name is required")
                .min(1, "Venue name is required")
                .max(200),
            venue_country_id: z.uuid("Venue country should be a valid UUID"),
            venue_city_id: z.uuid("Venue city should be a valid UUID"),
            venue_address: z
                .string("Venue address is required")
                .min(1, "Venue address is required"),
            venue_access_notes: z.string("Venue access notes should be a text").optional(),
            contact_name: z
                .string("Contact name is required")
                .min(1, "Contact name is required")
                .max(100),
            contact_email: z
                .string("Contact email is required")
                .email("Invalid email format")
                .max(255),
            contact_phone: z
                .string("Contact phone is required")
                .min(1, "Contact phone is required")
                .max(50),
            special_instructions: z.string("Special instructions should be a text").optional(),
        })
        .strict()
        .refine(
            (data) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return data.event_start_date >= today;
            },
            {
                message: "Event start date cannot be in the past",
                path: ["event_start_date"],
            }
        )
        .refine(
            (data) => {
                return data.event_end_date >= data.event_start_date;
            },
            {
                message: "Event end date must be on or after start date",
                path: ["event_end_date"],
            }
        ),
});

const updateJobNumberSchema = z.object({
    body: z.object({
        job_number: z
            .string()
            .max(100, "Job number must be at most 100 characters")
            .regex(
                /^[a-zA-Z0-9\-_]+$/,
                "Job number must be alphanumeric (letters, numbers, hyphens, underscores only)"
            ),
    }),
});

const progressStatusSchema = z.object({
    body: z
        .object({
            new_status: z.enum(
                orderStatusEnum.enumValues,
                enumMessageGenerator("New status", orderStatusEnum.enumValues)
            ),
            notes: z.string().optional(),
        })
        .strict(),
});

const updateTimeWindowsSchema = z.object({
    body: z
        .object({
            delivery_window_start: z
                .string("Delivery window start date is required")
                .refine(
                    (date) => !isNaN(Date.parse(date)),
                    "Invalid delivery window start date format"
                ),
            delivery_window_end: z
                .string("Delivery window end date is required")
                .refine(
                    (date) => !isNaN(Date.parse(date)),
                    "Invalid delivery window end date format"
                ),
            pickup_window_start: z
                .string("Pickup window start date is required")
                .refine(
                    (date) => !isNaN(Date.parse(date)),
                    "Invalid pickup window start date format"
                ),
            pickup_window_end: z
                .string("Pickup window end date is required")
                .refine(
                    (date) => !isNaN(Date.parse(date)),
                    "Invalid pickup window end date format"
                ),
        })
        .strict()
        .refine(
            (data) => {
                const deliveryStart = new Date(data.delivery_window_start);
                const deliveryEnd = new Date(data.delivery_window_end);
                return deliveryEnd >= deliveryStart;
            },
            {
                message: "Delivery window end must be after start",
                path: ["delivery_window_end"],
            }
        )
        .refine(
            (data) => {
                const pickupStart = new Date(data.pickup_window_start);
                const pickupEnd = new Date(data.pickup_window_end);
                return pickupEnd >= pickupStart;
            },
            {
                message: "Pickup window end must be after start",
                path: ["pickup_window_end"],
            }
        ),
});

const adjustLogisticsPricingSchema = z.object({
    body: z
        .object({
            adjusted_price: z
                .number("Adjusted price should be a number")
                .positive("Adjusted price must be greater than 0"),
            adjustment_reason: z
                .string("Adjustment reason should be a text")
                .min(10, "Adjustment reason must be at least 10 characters"),
        })
        .strict(),
});

const approveStandardPricingSchema = z.object({
    body: z
        .object({
            notes: z.string("Notes should be a text").optional(),
        })
        .strict(),
});

const approvePlatformPricingSchema = z.object({
    body: z
        .object({
            logistics_base_price: z
                .number("Logistics base price should be a number")
                .positive("Logistics base price must be greater than 0"),
            platform_margin_percent: z
                .number("Platform margin percent should be a number")
                .min(0, "Platform margin percent must be greater than 0")
                .max(100, "Platform margin percent must be less than 100"),
            notes: z.string("Notes should be a text").optional(),
        })
        .strict(),
});

const approveQuoteSchema = z.object({
    body: z
        .object({
            notes: z.string("Notes should be a text").optional(),
        })
        .strict(),
});

const declineQuoteSchema = z.object({
    body: z
        .object({
            decline_reason: z
                .string("Decline reason should be a text")
                .min(10, "Decline reason must be at least 10 characters"),
        })
        .strict(),
});

const updateVehicleSchema = z.object({
    body: z
        .object({
            vehicle_type_id: z.uuid("Invalid vehicle type ID"),
            reason: z
                .string("Reason should be a text")
                .min(10, "Reason must be at least 10 characters"),
        })
        .strict(),
});

const cancelOrderSchema = z.object({
    body: z
        .object({
            reason: z.enum(
                CANCEL_REASONS,
                enumMessageGenerator("Cancellation reason", CANCEL_REASONS)
            ),
            notes: z
                .string("Notes should be a text")
                .min(10, "Notes must be at least 10 characters"),
            notify_client: z.boolean().default(true),
        })
        .strict(),
});

const adminApproveQuoteSchema = z.object({
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

const truckDetailsSchema = z.object({
    body: z
        .object({
            delivery_truck_details: z.object({
                truck_plate: z.string().min(1, "Truck plate is required"),
                driver_name: z.string().min(1, "Driver name is required"),
                driver_contact: z.string().min(1, "Driver contact is required"),
                truck_size: z.string().optional(),
                tailgate_required: z.boolean().default(false),
                manpower: z.number().default(0),
                notes: z.string().optional(),
            }).optional(),
            pickup_truck_details: z.object({
                truck_plate: z.string().min(1, "Truck plate is required"),
                driver_name: z.string().min(1, "Driver name is required"),
                driver_contact: z.string().min(1, "Driver contact is required"),
                truck_size: z.string().optional(),
                tailgate_required: z.boolean().default(false),
                manpower: z.number().default(0),
                notes: z.string().optional(),
            }).optional(),
        })
        .strict()
        .refine(
            (data) => data.delivery_truck_details || data.pickup_truck_details,
            {
                message: "At least one truck details must be provided",
                path: ["delivery_truck_details", "pickup_truck_details"],
            }
        ),
});

export const orderSchemas = {
    calculateEstimateSchema,
    submitOrderSchema,
    updateJobNumberSchema,
    progressStatusSchema,
    updateTimeWindowsSchema,
    adjustLogisticsPricingSchema,
    approveStandardPricingSchema,
    approvePlatformPricingSchema,
    approveQuoteSchema,
    declineQuoteSchema,
    updateVehicleSchema,
    cancelOrderSchema,
    addOrderItemSchema,
    updateOrderItemQuantitySchema,
    adminApproveQuoteSchema,
    truckDetailsSchema
};
