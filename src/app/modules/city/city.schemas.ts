import { z } from "zod";

const citySchema = z.object({
    body: z.object({
        name: z
            .string({ message: "Name is required" })
            .min(1, "Name is required")
            .max(255, "Name must be under 255 characters"),
        country_id: z.uuid({ message: "Invalid country selection" }).min(1, "Country is required"),
    }),
});

export const citiesSchemas = {
    citySchema,
};
