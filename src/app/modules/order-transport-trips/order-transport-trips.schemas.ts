import z from "zod";

const legTypeSchema = z.enum(["DELIVERY", "PICKUP", "ACCESS", "TRANSFER"], {
    message: "Invalid leg type",
});

const createOrderTransportTripSchema = z.object({
    body: z
        .object({
            leg_type: legTypeSchema.default("DELIVERY"),
            truck_plate: z.string().trim().max(80).optional(),
            driver_name: z.string().trim().max(120).optional(),
            driver_contact: z.string().trim().max(80).optional(),
            truck_size: z.string().trim().max(80).optional(),
            manpower: z.number().int().min(0).optional(),
            tailgate_required: z.boolean().optional().default(false),
            notes: z.string().trim().optional(),
            sequence_no: z.number().int().min(0).optional().default(0),
        })
        .strict(),
});

const updateOrderTransportTripSchema = z.object({
    body: z
        .object({
            leg_type: legTypeSchema.optional(),
            truck_plate: z.string().trim().max(80).optional(),
            driver_name: z.string().trim().max(120).optional(),
            driver_contact: z.string().trim().max(80).optional(),
            truck_size: z.string().trim().max(80).optional(),
            manpower: z.number().int().min(0).optional(),
            tailgate_required: z.boolean().optional(),
            notes: z.string().trim().optional(),
            sequence_no: z.number().int().min(0).optional(),
        })
        .strict(),
});

export const OrderTransportTripsSchemas = {
    createOrderTransportTripSchema,
    updateOrderTransportTripSchema,
};
