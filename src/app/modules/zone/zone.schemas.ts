import { z } from "zod";

const createZoneSchema = z.object({
  body: z.object({
    warehouse: z
      .uuid({ message: "Invalid warehouse selection" })
      .min(1, "Warehouse is required"),
    company: z
      .uuid({ message: "Invalid company selection" })
      .min(1, "Company is required"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(50, "Name must be under 50 characters"),
    description: z
      .string()
      .optional()
      .or(z.literal("")),
    capacity: z
      .number({ message: "Capacity must be a number" })
      .int("Capacity must be an integer")
      .optional(),
    isActive: z.boolean().default(true),
  }),
});

const updateZoneSchema = z.object({
  body: z.object({
    warehouse: z
      .uuid({ message: "Invalid warehouse selection" })
      .min(1, "Warehouse is required")
      .optional(),
    company: z
      .uuid({ message: "Invalid company selection" })
      .min(1, "Company is required")
      .optional(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(50, "Name must be under 50 characters")
      .optional(),
    description: z
      .string()
      .optional()
      .or(z.literal("")),
    capacity: z
      .number({ message: "Capacity must be a number" })
      .int("Capacity must be an integer")
      .optional(),
    isActive: z.boolean().optional(),
  }),
});

export const zoneSchemas = {
  createZoneSchema,
  updateZoneSchema,
};
