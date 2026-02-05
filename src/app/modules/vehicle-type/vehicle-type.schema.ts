import { z } from "zod";

const createVehicleType = z.object({
  body: z.object({
    name: z
      .string()
      .min(2, { message: "Vehicle type name must be at least 2 characters long" })
      .max(100, { message: "Vehicle type name cannot exceed 100 characters" }),
    vehicle_size: z
      .string()
      .min(2, { message: "Vehicle size must be at least 2 characters long" })
      .max(100, { message: "Vehicle size cannot exceed 100 characters" }),
    is_active: z.boolean().optional().default(true),
    display_order: z.number().optional().default(1),
    description: z.string().optional(),
  }),
});

const updateVehicleType = z.object({
  body: z.object({
    name: z
      .string()
      .min(2, { message: "Vehicle type name must be at least 2 characters long" })
      .max(100, { message: "Vehicle type name cannot exceed 100 characters" }),
    vehicle_size: z
      .string()
      .min(2, { message: "Vehicle size must be at least 2 characters long" })
      .max(100, { message: "Vehicle size cannot exceed 100 characters" }),
    is_active: z.boolean().optional().default(true),
    display_order: z.number().optional().default(1),
    description: z.string().optional(),
  }),
});

export const vehicleTypeSchemas = {
  createVehicleType,
  updateVehicleType,
};
