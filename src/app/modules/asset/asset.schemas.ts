import { z } from "zod";

const createAssetSchema = z.object({
  body: z.object({
    company: z
      .uuid({ message: "Invalid company selection" })
      .min(1, "Company is required"),
    warehouse: z
      .uuid({ message: "Invalid warehouse selection" })
      .min(1, "Warehouse is required"),
    zone: z
      .uuid({ message: "Invalid zone selection" })
      .min(1, "Zone is required"),
    brand: z
      .uuid({ message: "Invalid brand selection" })
      .optional(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be under 200 characters"),
    description: z
      .string()
      .optional(),
    category: z.enum(["FURNITURE", "GLASSWARE", "INSTALLATION", "DECOR", "OTHER"], {
      message: "Category is required",
    }),
    images: z
      .array(z.url("Invalid image URL"))
      .optional()
      .default([]),
    trackingMethod: z.enum(["INDIVIDUAL", "BATCH"], {
      message: "Tracking method is required",
    }),
    totalQuantity: z
      .number({ message: "Total quantity must be a number" })
      .int("Total quantity must be an integer")
      .min(1, "Total quantity must be at least 1")
      .default(1),
    availableQuantity: z
      .number({ message: "Available quantity must be a number" })
      .int("Available quantity must be an integer")
      .min(0, "Available quantity cannot be negative")
      .default(1),
    qrCode: z
      .string()
      .min(1, "QR code is required")
      .max(100, "QR code must be under 100 characters"),
    packaging: z
      .string()
      .max(100, "Packaging must be under 100 characters")
      .optional(),
    weightPerUnit: z
      .number({ message: "Weight per unit must be a number" })
      .positive("Weight per unit must be positive"),
    dimensions: z
      .object({
        length: z.number().positive().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
      })
      .optional(),
    volumePerUnit: z
      .number({ message: "Volume per unit must be a number" })
      .positive("Volume per unit must be positive"),
    condition: z
      .enum(["GREEN", "ORANGE", "RED"])
      .default("GREEN"),
    conditionNotes: z
      .string()
      .optional(),
    refurbDaysEstimate: z
      .number({ message: "Refurbishment days must be a number" })
      .int("Refurbishment days must be an integer")
      .min(0, "Refurbishment days cannot be negative")
      .optional(),
    conditionHistory: z
      .array(z.string())
      .optional()
      .default([]),
    handlingTags: z
      .array(z.string())
      .optional()
      .default([]),
    status: z
      .enum(["AVAILABLE", "BOOKED", "OUT", "MAINTENANCE"])
      .default("AVAILABLE"),
  }),
});

const updateAssetSchema = z.object({
  body: z.object({
    company: z
      .uuid({ message: "Invalid company selection" })
      .min(1, "Company is required")
      .optional(),
    warehouse: z
      .uuid({ message: "Invalid warehouse selection" })
      .min(1, "Warehouse is required")
      .optional(),
    zone: z
      .uuid({ message: "Invalid zone selection" })
      .min(1, "Zone is required")
      .optional(),
    brand: z
      .uuid({ message: "Invalid brand selection" })
      .optional(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(200, "Name must be under 200 characters")
      .optional(),
    description: z
      .string()
      .optional()
      .or(z.literal("")),
    category: z
      .enum(["FURNITURE", "GLASSWARE", "INSTALLATION", "DECOR", "OTHER"], {
        message: "Invalid category",
      })
      .optional(),
    images: z
      .array(z.url("Invalid image URL"))
      .optional(),
    trackingMethod: z
      .enum(["INDIVIDUAL", "BATCH"], {
        message: "Invalid tracking method",
      })
      .optional(),
    totalQuantity: z
      .number({ message: "Total quantity must be a number" })
      .int("Total quantity must be an integer")
      .min(1, "Total quantity must be at least 1")
      .optional(),
    availableQuantity: z
      .number({ message: "Available quantity must be a number" })
      .int("Available quantity must be an integer")
      .min(0, "Available quantity cannot be negative")
      .optional(),
    qrCode: z
      .string()
      .min(1, "QR code is required")
      .max(100, "QR code must be under 100 characters")
      .optional(),
    packaging: z
      .string()
      .max(100, "Packaging must be under 100 characters")
      .optional()
      .or(z.literal("")),
    weightPerUnit: z
      .number({ message: "Weight per unit must be a number" })
      .positive("Weight per unit must be positive")
      .optional(),
    dimensions: z
      .object({
        length: z.number().positive().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
      })
      .optional(),
    volumePerUnit: z
      .number({ message: "Volume per unit must be a number" })
      .positive("Volume per unit must be positive")
      .optional(),
    condition: z
      .enum(["GREEN", "ORANGE", "RED"])
      .optional(),
    conditionNotes: z
      .string()
      .optional()
      .or(z.literal("")),
    refurbDaysEstimate: z
      .number({ message: "Refurbishment days must be a number" })
      .int("Refurbishment days must be an integer")
      .min(0, "Refurbishment days cannot be negative")
      .optional(),
    handlingTags: z
      .array(z.string())
      .optional(),
    status: z
      .enum(["AVAILABLE", "BOOKED", "OUT", "MAINTENANCE"])
      .optional(),
  }),
});

export const assetSchemas = {
  createAssetSchema,
  updateAssetSchema,
};
