import { z } from "zod";

const createVehicleType = z.object({
  body: z.object({
    name: z.string()
      .min(1, { message: "Vehicle type name is required" })
      .max(100, { message: "Vehicle type name cannot exceed 100 characters" }),
    vehicle_size: z.number().min(1, { message: "Vehicle size is required" }),
    is_active: z.boolean().optional().default(true),
    display_order: z.number().optional().default(1),
    description: z.string().optional(),
  }),
});

const updateVehicleType = z.object({
  body: z.object({
    name: z.string()
      .min(1, { message: "Vehicle type name is required" })
      .max(100, { message: "Vehicle type name cannot exceed 100 characters" }),
    vehicle_size: z.number().min(1, { message: "Vehicle size is required" }),
    is_active: z.boolean().optional().default(true),
    display_order: z.number().optional().default(1),
    description: z.string().optional(),
  }).partial(),
});

export const vehicleTypeSchemas = {
  createVehicleType,
  updateVehicleType,
};
