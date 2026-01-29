import z from "zod";

const createTransportRateSchema = z.object({
    body: z
        .object({
            company_id: z.string().uuid("Invalid company ID").optional().nullable(),
            city_id: z.uuid("Invalid city ID"),
            area: z.string().max(100, "Area must be under 100 characters").optional().nullable(),
            trip_type: z.enum(["ONE_WAY", "ROUND_TRIP"], {
                message: "Trip type must be ONE_WAY or ROUND_TRIP",
            }),
            vehicle_type: z.enum(["STANDARD", "7_TON", "10_TON"], {
                message: "Vehicle type must be STANDARD, 7_TON, or 10_TON",
            }),
            rate: z.number({ message: "Rate must be a number" }).min(0, "Rate must be at least 0"),
            is_active: z.boolean().optional().default(true),
        })
        .strict(),
});

const updateTransportRateSchema = z.object({
    body: z
        .object({
            rate: z
                .number({ message: "Rate must be a number" })
                .min(0, "Rate must be at least 0")
                .optional(),
            is_active: z.boolean().optional(),
        })
        .strict(),
});

export const TransportRatesSchemas = {
    createTransportRateSchema,
    updateTransportRateSchema,
};
