import z from "zod";

const collectionSchema = z.object({
    body: z
        .object({
            company_id: z.uuid({ message: "Company ID must be a valid UUID" }),
            brand_id: z.uuid({ message: "Brand ID must be a valid UUID" }).optional(),
            name: z
                .string({ message: "Name is required" })
                .min(1, { message: "Name is required" })
                .max(200, { message: "Name cannot exceed 200 characters" }),
            description: z.string().optional(),
            images: z.array(z.string()).optional().default([]),
            category: z
                .string()
                .max(50, { message: "Category cannot exceed 50 characters" })
                .optional(),
            is_active: z.boolean().optional().default(true),
        })
        .strict(),
});

const updateCollectionSchema = z.object({
    body: z
        .object({
            brand_id: z.uuid({ message: "Brand ID must be a valid UUID" }).optional(),
            name: z
                .string({ message: "Name cannot be empty" })
                .min(1, { message: "Name cannot be empty" })
                .max(200, { message: "Name cannot exceed 200 characters" })
                .optional(),
            description: z.string().optional(),
            images: z.array(z.string()).optional(),
            category: z
                .string()
                .max(50, { message: "Category cannot exceed 50 characters" })
                .optional(),
            is_active: z.boolean().optional(),
        })
        .strict(),
});

const collectionItemSchema = z.object({
    body: z
        .object({
            asset_id: z.uuid({ message: "Asset ID must be a valid UUID" }),
            default_quantity: z
                .number()
                .int()
                .min(1, { message: "Quantity must be at least 1" })
                .default(1),
            notes: z.string().optional(),
            display_order: z.number().int().optional(),
        })
        .strict(),
});

const updateCollectionItemSchema = z.object({
    body: z
        .object({
            default_quantity: z
                .number()
                .int()
                .min(1, { message: "Quantity must be at least 1" })
                .optional(),
            notes: z.string().optional(),
            display_order: z.number().int().optional(),
        })
        .strict(),
});

export const CollectionSchemas = {
    collectionSchema,
    updateCollectionSchema,
    collectionItemSchema,
    updateCollectionItemSchema,
};
