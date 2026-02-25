import { z } from "zod";

const countrySchema = z.object({
    body: z.object({
        name: z
            .string({ message: "Name is required" })
            .min(1, "Name is required")
            .max(100, "Name must be under 100 characters"),
    }),
});

export const countriesSchemas = {
    countrySchema,
};
