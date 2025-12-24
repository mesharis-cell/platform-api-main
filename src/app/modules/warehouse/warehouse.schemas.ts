import { z } from "zod";

const warehouseSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Name is required" })
      .min(1, "Name is required")
      .max(100, "Name must be under 100 characters"),
    country: z
      .string({ message: "Country is required" })
      .min(1, "Country is required")
      .max(50, "Country must be under 50 characters"),
    city: z
      .string({ message: "City is required" })
      .min(1, "City is required")
      .max(50, "City must be under 50 characters"),
    address: z
      .string({ message: "Address is required" })
      .min(1, "Address is required"),
    coordinates: z
      .object({
        lat: z.number({ message: "Latitude must be a number" }).optional(),
        lng: z.number({ message: "Longitude must be a number" }).optional(),
      })
      .optional(),
    is_active: z.boolean().default(true),
  }),
});

const updateWarehouseSchema = z.object({
  body: z.object({
    name: z
      .string({ message: "Name is required" })
      .min(1, "Name is required")
      .max(100, "Name must be under 100 characters")
      .optional(),
    country: z
      .string({ message: "Country is required" })
      .min(1, "Country is required")
      .max(50, "Country must be under 50 characters")
      .optional(),
    city: z
      .string({ message: "City is required" })
      .min(1, "City is required")
      .max(50, "City must be under 50 characters")
      .optional(),
    address: z
      .string({ message: "Address is required" })
      .min(1, "Address is required")
      .optional(),
    coordinates: z
      .object({
        lat: z.number({ message: "Latitude must be a number" }),
        lng: z.number({ message: "Longitude must be a number" }),
      })
      .optional(),
    is_active: z.boolean().optional(),
  }),
});

export const warehouseSchemas = {
  warehouseSchema,
  updateWarehouseSchema,
};
