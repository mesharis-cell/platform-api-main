import z from "zod";

const createWarehouse = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, { message: "Name is required" })
      .max(100, { message: "Name cannot exceed 100 characters" }),
    country: z
      .string()
      .min(1, { message: "Country is required" })
      .max(50, { message: "Country cannot exceed 50 characters" }),
    city: z
      .string()
      .min(1, { message: "City is required" })
      .max(50, { message: "City cannot exceed 50 characters" }),
    address: z.string().min(1, { message: "Address is required" }),
    coordinates: z
      .object({
        lat: z.number({ message: "Latitude must be a number" }),
        lng: z.number({ message: "Longitude must be a number" }),
      })
      .optional(),
    isActive: z.boolean().optional().default(true),
  }),
});

const updateWarehouse = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, { message: "Name cannot be empty" })
      .max(100, { message: "Name cannot exceed 100 characters" })
      .optional(),
    country: z
      .string()
      .min(1, { message: "Country cannot be empty" })
      .max(50, { message: "Country cannot exceed 50 characters" })
      .optional(),
    city: z
      .string()
      .min(1, { message: "City cannot be empty" })
      .max(50, { message: "City cannot exceed 50 characters" })
      .optional(),
    address: z.string().min(1, { message: "Address cannot be empty" }).optional(),
    coordinates: z
      .object({
        lat: z.number({ message: "Latitude must be a number" }).optional(),
        lng: z.number({ message: "Longitude must be a number" }).optional(),
      })
      .optional(),
    isActive: z.boolean().optional(),
  }),
});

export const WarehouseSchemas = {
  createWarehouse,
  updateWarehouse,
};
