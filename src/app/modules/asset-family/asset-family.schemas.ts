import z from "zod";
import { stockModeEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const assetImageSchema = z.object({
    url: z.string().url("Invalid image URL"),
    note: z.string().max(500, "Image note must be under 500 characters").optional(),
});

const createAssetFamilySchema = z.object({
    body: z.object({
        company_id: z.string({ message: "Company ID is required" }).uuid("Invalid company ID"),
        brand_id: z.string().uuid("Invalid brand ID").optional().nullable(),
        team_id: z.string().uuid("Invalid team ID").optional().nullable(),
        name: z
            .string({ message: "Name is required" })
            .min(1, "Name is required")
            .max(200, "Name must be under 200 characters"),
        company_item_code: z
            .string()
            .trim()
            .max(150, "Company item code must be under 150 characters")
            .optional()
            .nullable(),
        description: z.string().optional().nullable(),
        category_id: z.string().uuid("Invalid category ID").optional(),
        new_category: z
            .object({
                name: z.string().min(1, "Category name is required").max(100),
                color: z
                    .string()
                    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be hex")
                    .optional(),
            })
            .optional(),
        images: z.array(assetImageSchema).optional().default([]),
        on_display_image: z.string().url("Invalid on display image URL").optional().nullable(),
        stock_mode: z.enum(stockModeEnum.enumValues, {
            message: enumMessageGenerator("Stock mode", stockModeEnum.enumValues),
        }),
        packaging: z
            .string()
            .max(100, "Packaging must be under 100 characters")
            .optional()
            .nullable(),
        weight_per_unit: z
            .number()
            .positive("Weight per unit must be positive")
            .optional()
            .nullable(),
        dimensions: z
            .object({
                length: z.number().positive().optional(),
                width: z.number().positive().optional(),
                height: z.number().positive().optional(),
            })
            .optional()
            .default({}),
        volume_per_unit: z
            .number()
            .positive("Volume per unit must be positive")
            .optional()
            .nullable(),
        handling_tags: z.array(z.string()).optional().default([]),
        is_active: z.boolean().optional().default(true),
    }),
});

const updateAssetFamilySchema = z.object({
    body: z.object({
        company_id: z.string().uuid("Invalid company ID").optional(),
        brand_id: z.string().uuid("Invalid brand ID").optional().nullable(),
        team_id: z.string().uuid("Invalid team ID").optional().nullable(),
        name: z.string().min(1, "Name cannot be empty").max(200).optional(),
        company_item_code: z
            .string()
            .trim()
            .max(150, "Company item code must be under 150 characters")
            .optional()
            .nullable(),
        description: z.string().optional().nullable(),
        category_id: z.string().uuid("Invalid category ID").optional(),
        new_category: z
            .object({
                name: z.string().min(1).max(100),
                color: z
                    .string()
                    .regex(/^#[0-9a-fA-F]{6}$/)
                    .optional(),
            })
            .optional(),
        images: z.array(assetImageSchema).optional(),
        on_display_image: z.string().url("Invalid on display image URL").optional().nullable(),
        stock_mode: z
            .enum(stockModeEnum.enumValues, {
                message: enumMessageGenerator("Stock mode", stockModeEnum.enumValues),
            })
            .optional(),
        packaging: z
            .string()
            .max(100, "Packaging must be under 100 characters")
            .optional()
            .nullable(),
        weight_per_unit: z
            .number()
            .positive("Weight per unit must be positive")
            .optional()
            .nullable(),
        dimensions: z
            .object({
                length: z.number().positive().optional(),
                width: z.number().positive().optional(),
                height: z.number().positive().optional(),
            })
            .optional(),
        volume_per_unit: z
            .number()
            .positive("Volume per unit must be positive")
            .optional()
            .nullable(),
        handling_tags: z.array(z.string()).optional(),
        is_active: z.boolean().optional(),
    }),
});

export const AssetFamilySchemas = {
    createAssetFamilySchema,
    updateAssetFamilySchema,
};
