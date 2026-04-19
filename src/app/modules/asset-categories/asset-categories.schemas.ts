import z from "zod";

const createAssetCategory = z.object({
    body: z.object({
        name: z.string().min(1, "Name is required").max(100, "Name must be under 100 characters"),
        color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex code (e.g. #4A90D9)")
            .optional(),
        company_id: z.string().uuid("Company ID must be a valid UUID").optional().nullable(),
    }),
});

const updateAssetCategory = z.object({
    body: z
        .object({
            name: z
                .string()
                .min(1, "Name cannot be empty")
                .max(100, "Name must be under 100 characters")
                .optional(),
            color: z
                .string()
                .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex code")
                .optional(),
            sort_order: z.number().int().min(0).optional(),
            is_active: z.boolean().optional(),
        })
        .strict(),
});

export const AssetCategorySchemas = {
    createAssetCategory,
    updateAssetCategory,
};
