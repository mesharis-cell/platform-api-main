import z from "zod";
import { assetConditionEnum, assetStatusEnum, trackingMethodEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const assetImageSchema = z.object({
    url: z.string().url("Invalid image URL"),
    note: z.string().max(500, "Image note must be under 500 characters").optional(),
});

const createAssetSchema = z.object({
    body: z
        .object({
            company_id: z.string().uuid("Invalid company ID format").optional(),
            warehouse_id: z
                .string({ message: "Warehouse ID is required" })
                .uuid("Invalid warehouse ID format"),
            zone_id: z.string({ message: "Zone ID is required" }).uuid("Invalid zone ID format"),
            brand_id: z.string().uuid("Invalid brand ID format").optional(),
            family_id: z.string().uuid("Invalid family ID format").optional().nullable(),
            name: z
                .string({ message: "Name is required" })
                .min(1, "Name is required")
                .max(200, "Name must be under 200 characters"),
            description: z.string().optional().nullable(),
            category: z.string().min(1, "Category is required").max(100).optional().nullable(),
            images: z.array(assetImageSchema).optional().default([]),
            on_display_image: z.string().url("Invalid on display image URL").optional(),
            tracking_method: z
                .enum(trackingMethodEnum.enumValues, {
                    message: enumMessageGenerator("Tracking method", trackingMethodEnum.enumValues),
                })
                .optional(),
            quantity: z
                .number({ message: "Quantity must be a number" })
                .int("Quantity must be an integer")
                .min(1, "Quantity must be at least 1")
                .optional(),
            total_quantity: z
                .number({ message: "Total quantity must be a number" })
                .int("Total quantity must be an integer")
                .min(1, "Total quantity must be at least 1")
                .optional(),
            available_quantity: z
                .number({ message: "Available quantity must be a number" })
                .int("Available quantity must be an integer")
                .min(0, "Available quantity cannot be negative")
                .default(1),
            packaging: z.string().max(100, "Packaging must be under 100 characters").optional().nullable(),
            weight_per_unit: z
                .number({ message: "Weight per unit must be a number" })
                .positive("Weight per unit must be positive")
                .optional(),
            dimensions: z
                .object({
                    length: z.number().positive().optional(),
                    width: z.number().positive().optional(),
                    height: z.number().positive().optional(),
                })
                .optional()
                .default({}),
            volume_per_unit: z
                .number({ message: "Volume per unit must be a number" })
                .positive("Volume per unit must be positive")
                .optional(),
            condition: z
                .enum(assetConditionEnum.enumValues, {
                    message: enumMessageGenerator("Condition", assetConditionEnum.enumValues),
                })
                .optional()
                .default("GREEN"),
            condition_notes: z.string().optional().nullable(),
            refurb_days_estimate: z
                .number({ message: "Refurbishment days must be a number" })
                .int("Refurbishment days must be an integer")
                .min(0, "Refurbishment days cannot be negative")
                .optional(),
            team_id: z.string().uuid("Invalid team ID").optional().nullable(),
            handling_tags: z.array(z.string()).optional().default([]),
            status: z
                .enum(assetStatusEnum.enumValues, {
                    message: enumMessageGenerator("Status", assetStatusEnum.enumValues),
                })
                .optional()
                .default("AVAILABLE"),
            condition_photos: z
                .array(z.string().url("Invalid condition photo URL"))
                .optional()
                .default([]),
        })
        .refine(
            (data) => {
                const resolvedTotal = data.total_quantity ?? data.quantity ?? 1;
                return data.available_quantity <= resolvedTotal;
            },
            {
                message: "Available quantity cannot exceed total quantity",
                path: ["available_quantity"],
            }
        )
        .superRefine((data, ctx) => {
            if (!data.family_id && !data.company_id) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Company ID is required when asset family is not provided",
                    path: ["company_id"],
                });
            }

            if (!data.family_id && !data.category) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Category is required when asset family is not provided",
                    path: ["category"],
                });
            }

            if (!data.family_id && !data.tracking_method) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Tracking method is required when asset family is not provided",
                    path: ["tracking_method"],
                });
            }

            if (!data.family_id && data.weight_per_unit === undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Weight per unit is required when asset family is not provided",
                    path: ["weight_per_unit"],
                });
            }

            if (!data.family_id && data.volume_per_unit === undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Volume per unit is required when asset family is not provided",
                    path: ["volume_per_unit"],
                });
            }
        })
        .refine(
            (data) => data.tracking_method !== "BATCH" || !!data.packaging || !!data.family_id,
            {
                message:
                    "Packaging description is required for BATCH tracking method unless inherited from asset family",
                path: ["packaging"],
            }
        )
        .transform((data) => ({
            ...data,
            total_quantity: data.total_quantity ?? data.quantity ?? 1,
        })),
});

const updateAssetSchema = z.object({
    body: z.object({
        company_id: z.string().uuid("Invalid company ID format").optional(),
        warehouse_id: z.string().uuid("Invalid warehouse ID format").optional(),
        zone_id: z.string().uuid("Invalid zone ID format").optional(),
        brand_id: z.string().uuid("Invalid brand ID format").optional().nullable(),
        family_id: z.string().uuid("Invalid family ID format").optional().nullable(),
        name: z
            .string()
            .min(1, "Name cannot be empty")
            .max(200, "Name must be under 200 characters")
            .optional(),
        description: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        images: z.array(assetImageSchema).optional(),
        on_display_image: z.string().url("Invalid on display image URL").optional().nullable(),
        tracking_method: z
            .enum(trackingMethodEnum.enumValues, {
                message: enumMessageGenerator("Tracking method", trackingMethodEnum.enumValues),
            })
            .optional(),
        total_quantity: z
            .number()
            .int("Total quantity must be an integer")
            .min(1, "Total quantity must be at least 1")
            .optional(),
        available_quantity: z
            .number()
            .int("Available quantity must be an integer")
            .min(0, "Available quantity cannot be negative")
            .optional(),
        packaging: z
            .string()
            .max(100, "Packaging must be under 100 characters")
            .optional()
            .nullable(),
        weight_per_unit: z.number().positive("Weight per unit must be positive").optional(),
        dimensions: z
            .object({
                length: z.number().positive().optional(),
                width: z.number().positive().optional(),
                height: z.number().positive().optional(),
            })
            .optional(),
        volume_per_unit: z.number().positive("Volume per unit must be positive").optional(),
        condition: z
            .enum(assetConditionEnum.enumValues, {
                message: enumMessageGenerator("Condition", assetConditionEnum.enumValues),
            })
            .optional(),
        condition_notes: z.string().optional().nullable(),
        refurb_days_estimate: z
            .number()
            .int("Refurbishment days must be an integer")
            .min(0, "Refurbishment days cannot be negative")
            .optional()
            .nullable(),
        team_id: z.string().uuid("Invalid team ID").optional().nullable(),
        handling_tags: z.array(z.string()).optional(),
        status: z
            .enum(Object.values(assetStatusEnum.enumValues), {
                message: enumMessageGenerator("Status", Object.values(assetStatusEnum.enumValues)),
            })
            .optional(),
    }),
});

const addAssetUnitsSchema = z.object({
    body: z.object({
        quantity: z
            .number({ message: "Quantity must be a number" })
            .int("Quantity must be an integer")
            .min(1, "Quantity must be at least 1"),
    }),
});

// ----------------------------------- BATCH AVAILABILITY SCHEMA --------------------------
const batchAvailabilitySchema = z.object({
    body: z.object({
        asset_ids: z
            .array(z.string().uuid("Invalid asset ID format"))
            .min(1, "At least one asset ID is required"),
    }),
});

// ----------------------------------- CHECK AVAILABILITY SCHEMA --------------------------
const checkAvailabilitySchema = z.object({
    body: z
        .object({
            start_date: z.string({ message: "Start date is required" }),
            end_date: z.string({ message: "End date is required" }),
            asset_id: z.string().uuid("Invalid asset ID format").optional(),
            asset_ids: z.array(z.string().uuid("Invalid asset ID format")).optional(),
            items: z
                .array(
                    z.object({
                        asset_id: z.string().uuid("Invalid asset ID format"),
                        quantity: z.number().int().min(1, "Quantity must be at least 1"),
                    })
                )
                .optional(),
        })
        .refine((data) => data.asset_id || data.asset_ids || data.items, {
            message: "Either asset_id, asset_ids, or items array is required",
        }),
});

// ----------------------------------- ADD CONDITION HISTORY SCHEMA ---------------------------
const addConditionHistorySchema = z.object({
    body: z
        .object({
            asset_id: z.string({ message: "Asset ID is required" }).uuid("Invalid asset ID format"),
            condition: z
                .enum(assetConditionEnum.enumValues, {
                    message: enumMessageGenerator("Condition", assetConditionEnum.enumValues),
                })
                .optional(),
            notes: z.string().max(1000, "Notes must be under 1000 characters").optional(),
            photos: z.array(z.string().url("Invalid photo URL")).optional().default([]),
            damage_report_entries: z
                .array(
                    z.object({
                        url: z.string().url("Invalid damage image URL"),
                        description: z
                            .string()
                            .max(1000, "Damage description must be under 1000 characters")
                            .optional(),
                    })
                )
                .optional()
                .default([]),
            refurb_days_estimate: z
                .number({ message: "Refurbishment days must be a number" })
                .int("Refurbishment days must be an integer")
                .min(0, "Refurbishment days cannot be negative")
                .optional(),
        })
        .superRefine((data, ctx) => {
            const imageCount = data.photos.length + data.damage_report_entries.length;
            if (data.condition === "RED" && imageCount === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "At least one damage photo is required when marking items as Red",
                    path: ["damage_report_entries"],
                });
            }
        }),
});

// ----------------------------------- GENERATE QR CODE SCHEMA --------------------------------
const generateQRCodeSchema = z.object({
    body: z.object({
        qr_code: z
            .string({ message: "QR code string is required" })
            .min(1, "QR code string cannot be empty")
            .max(500, "QR code string must be under 500 characters"),
    }),
});

// ----------------------------------- COMPLETE MAINTENANCE SCHEMA ----------------------------
const completeMaintenanceSchema = z.object({
    body: z.object({
        asset_id: z.string({ message: "Asset ID is required" }).uuid("Invalid asset ID format"),
        maintenance_notes: z
            .string({ message: "Maintenance notes are required" })
            .min(1, "Maintenance notes cannot be empty")
            .max(1000, "Maintenance notes must be under 1000 characters"),
    }),
});

export const AssetSchemas = {
    createAssetSchema,
    updateAssetSchema,
    addAssetUnitsSchema,
    batchAvailabilitySchema,
    checkAvailabilitySchema,
    addConditionHistorySchema,
    generateQRCodeSchema,
    completeMaintenanceSchema,
};
