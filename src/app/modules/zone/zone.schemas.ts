import { z } from "zod";

const zoneSchema = z.object({
    body: z.object({
        warehouse_id: z
            .uuid({ message: "Invalid warehouse selection" })
            .min(1, "Warehouse is required"),
        company_id: z.uuid({ message: "Invalid company selection" }).min(1, "Company is required"),
        name: z
            .string({ message: "Name is required" })
            .min(1, "Name is required")
            .max(50, "Name must be under 50 characters"),
        description: z.string().optional().or(z.literal("")),
        capacity: z
            .number({ message: "Capacity must be a number" })
            .int("Capacity must be an integer")
            .positive("Capacity must be positive")
            .optional(),
        is_active: z.boolean().default(true),
    }),
});

const updateZoneSchema = z.object({
    body: z.object({
        warehouse_id: z.uuid({ message: "Invalid warehouse selection" }).optional(),
        company_id: z.uuid({ message: "Invalid company selection" }).optional(),
        name: z
            .string({ message: "Name is required" })
            .min(1, "Name is required")
            .max(50, "Name must be under 50 characters")
            .optional(),
        description: z.string().optional().or(z.literal("")),
        capacity: z
            .number({ message: "Capacity must be a number" })
            .int("Capacity must be an integer")
            .positive("Capacity must be positive")
            .optional(),
        is_active: z.boolean().optional(),
    }),
});

export const zoneSchemas = {
    zoneSchema,
    updateZoneSchema,
};
