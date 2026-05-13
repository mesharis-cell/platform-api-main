import z from "zod";
import { assetConditionEnum, assetStatusEnum, stockModeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const assetImageSchema = z.object({
    url: z.string().url("Invalid image URL"),
    note: z.string().max(500, "Image note must be under 500 characters").optional(),
});

const createAssetSchema = z.object({
    body: z
        .object({
            company_id: z
                .string({ message: "Company ID is required" })
                .uuid("Invalid company ID format"),
            warehouse_id: z
                .string({ message: "Warehouse ID is required" })
                .uuid("Invalid warehouse ID format"),
            zone_id: z.string({ message: "Zone ID is required" }).uuid("Invalid zone ID format"),
            brand_id: z.string().uuid("Invalid brand ID format").optional(),
            // group_id (optional): if supplied, the new asset joins this existing group.
            // Sibling constraints (same company+brand+stock_mode) validated at service layer.
            group_id: z.string().uuid("Invalid group ID format").optional().nullable(),
            // is_part_of_group: opt-out toggle from the wizard. Defaults to true — the
            // common case is creating a group. False means raw asset (group_id remains
            // NULL even on serialized creates).
            is_part_of_group: z.boolean().optional().default(true),
            // group_name: required if creating a new group (no group_id supplied AND
            // is_part_of_group true). Service layer enforces.
            group_name: z
                .string()
                .min(1, "Group name cannot be empty")
                .max(200, "Group name must be under 200 characters")
                .optional()
                .nullable(),
            name: z
                .string({ message: "Name is required" })
                .min(1, "Name is required")
                .max(200, "Name must be under 200 characters"),
            description: z.string().optional().nullable(),
            category: z.string().min(1, "Category is required").max(100).optional().nullable(),
            images: z.array(assetImageSchema).optional().default([]),
            on_display_image: z.string().url("Invalid on display image URL").optional(),
            // stock_mode replaces tracking_method. Required.
            stock_mode: z.enum(stockModeEnum.enumValues, {
                message: enumMessageGenerator("Stock mode", stockModeEnum.enumValues),
            }),
            low_stock_threshold: z
                .number()
                .int("Low-stock threshold must be an integer")
                .min(0, "Low-stock threshold cannot be negative")
                .optional()
                .nullable(),
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
            packaging: z
                .string()
                .max(100, "Packaging must be under 100 characters")
                .optional()
                .nullable(),
            weight_per_unit: z
                .number({ message: "Weight per unit is required" })
                .positive("Weight per unit must be positive"),
            dimensions: z
                .object({
                    length: z.number().positive().optional(),
                    width: z.number().positive().optional(),
                    height: z.number().positive().optional(),
                })
                .optional()
                .default({}),
            volume_per_unit: z
                .number({ message: "Volume per unit is required" })
                .positive("Volume per unit must be positive"),
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
        .refine((data) => data.stock_mode !== "POOLED" || !!data.packaging, {
            message: "Packaging description is required for POOLED stock_mode",
            path: ["packaging"],
        })
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
        // group_id can be set, changed, or cleared (NULL ⟹ group_name auto-cleared by service)
        group_id: z.string().uuid("Invalid group ID format").optional().nullable(),
        group_name: z
            .string()
            .min(1, "Group name cannot be empty")
            .max(200, "Group name must be under 200 characters")
            .optional()
            .nullable(),
        name: z
            .string()
            .min(1, "Name cannot be empty")
            .max(200, "Name must be under 200 characters")
            .optional(),
        description: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        images: z.array(assetImageSchema).optional(),
        on_display_image: z.string().url("Invalid on display image URL").optional().nullable(),
        // stock_mode — changing this is blocked at service layer if asset has active bookings
        stock_mode: z
            .enum(stockModeEnum.enumValues, {
                message: enumMessageGenerator("Stock mode", stockModeEnum.enumValues),
            })
            .optional(),
        low_stock_threshold: z
            .number()
            .int("Low-stock threshold must be an integer")
            .min(0, "Low-stock threshold cannot be negative")
            .optional()
            .nullable(),
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

// Bulk-group: gather N selected assets into a single group_id.
// Service-layer validates same company+brand+stock_mode across selections,
// rejects cross-group conflicts, and enforces cross-group name uniqueness.
const bulkGroupAssetsSchema = z.object({
    body: z.object({
        asset_ids: z
            .array(z.string().uuid("Invalid asset ID format"))
            .min(2, "At least 2 asset IDs are required to form a group"),
        target_group_id: z.string().uuid("Invalid group ID format").optional(),
        group_name: z
            .string({ message: "Group name is required" })
            .min(1, "Group name cannot be empty")
            .max(200, "Group name must be under 200 characters"),
    }),
});

// ----------------------------------- AVAILABILITY SCHEMA --------------------------------
// Unified replacement for the old batch-availability + check-availability pair.
// Takes a list of (asset_id, optional quantity) items and an optional window.
// Without a window the response still surfaces hard-blocks (TRANSFORMED /
// MAINTENANCE-serialized) and self-booking OUT accounting, but no booking
// conflicts (since "right now" has no overlap to compute).
const availabilitySchema = z.object({
    body: z.object({
        items: z
            .array(
                z.object({
                    asset_id: z.string().uuid("Invalid asset ID format"),
                    quantity: z
                        .number()
                        .int("Quantity must be an integer")
                        .min(1, "Quantity must be at least 1")
                        .optional(),
                })
            )
            .min(1, "At least one item is required"),
        window: z
            .object({
                start: z.string({ message: "Window start is required" }),
                end: z.string({ message: "Window end is required" }),
            })
            .refine(
                (w) =>
                    !Number.isNaN(new Date(w.start).getTime()) &&
                    !Number.isNaN(new Date(w.end).getTime()),
                { message: "Window start/end must be valid ISO datetimes" }
            )
            .refine((w) => new Date(w.start).getTime() <= new Date(w.end).getTime(), {
                message: "Window end must be on or after window start",
            })
            .optional(),
        exclude_entity: z
            .object({
                type: z.enum(["ORDER", "SELF_PICKUP"]),
                id: z.string().uuid("Invalid entity ID"),
            })
            .optional(),
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
    bulkGroupAssetsSchema,
    availabilitySchema,
    addConditionHistorySchema,
    generateQRCodeSchema,
    completeMaintenanceSchema,
};
