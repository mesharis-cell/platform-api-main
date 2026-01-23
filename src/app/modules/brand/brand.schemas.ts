import { z } from "zod";

const brandSchema = z.object({
    body: z.object({
        company_id: z.uuid({ message: "Invalid company selection" }).min(1, "Company is required"),
        name: z
            .string({ message: "Name is required" })
            .min(1, "Name is required")
            .max(100, "Name must be under 100 characters"),
        description: z.string().optional().or(z.literal("")),
        logo_url: z.url("Invalid logo URL").optional().or(z.literal("")),
        is_active: z.boolean().default(true),
    }),
});

const updateBrandSchema = z.object({
    body: z.object({
        name: z
            .string({ message: "Name is required" })
            .min(1, "Name is required")
            .max(100, "Name must be under 100 characters")
            .optional(),
        description: z.string().optional().or(z.literal("")),
        logo_url: z.url("Invalid logo URL").optional().or(z.literal("")),
        is_active: z.boolean().optional(),
    }),
});

export const brandsSchemas = {
    brandSchema,
    updateBrandSchema,
};
