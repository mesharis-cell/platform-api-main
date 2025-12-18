import z from "zod";

const createCollection = z.object({
  body: z.object({
    company: z.uuid({ message: "Company ID must be a valid UUID" }),
    brand: z.uuid({ message: "Brand ID must be a valid UUID" }).optional(),
    name: z
      .string()
      .min(1, { message: "Name is required" })
      .max(200, { message: "Name cannot exceed 200 characters" }),
    description: z.string().optional(),
    images: z.array(z.string()).optional().default([]),
    category: z
      .string()
      .max(50, { message: "Category cannot exceed 50 characters" })
      .optional(),
    isActive: z.boolean().optional().default(true),
  }),
});

const updateCollection = z.object({
  body: z.object({
    brand: z.uuid({ message: "Brand ID must be a valid UUID" }).optional(),
    name: z
      .string()
      .min(1, { message: "Name cannot be empty" })
      .max(200, { message: "Name cannot exceed 200 characters" })
      .optional(),
    description: z.string().optional(),
    images: z.array(z.string()).optional(),
    category: z
      .string()
      .max(50, { message: "Category cannot exceed 50 characters" })
      .optional(),
    isActive: z.boolean().optional(),
  }),
});

const createCollectionItem = z.object({
  body: z.object({
    collection: z.uuid({ message: "Collection ID must be a valid UUID" }),
    asset: z.uuid({ message: "Asset ID must be a valid UUID" }),
    defaultQuantity: z
      .number()
      .int()
      .min(1, { message: "Quantity must be at least 1" })
      .default(1),
    notes: z.string().optional(),
    displayOrder: z.number().int().optional(),
  }),
});

const updateCollectionItem = z.object({
  body: z.object({
    collection: z.uuid({ message: "Collection ID must be a valid UUID" }).optional(),
    asset: z.uuid({ message: "Asset ID must be a valid UUID" }).optional(),
    defaultQuantity: z
      .number()
      .int()
      .min(1, { message: "Quantity must be at least 1" })
      .optional(),
    notes: z.string().optional(),
    displayOrder: z.number().int().optional(),
  }),
});

export const CollectionSchemas = {
  createCollection,
  updateCollection,
  createCollectionItem,
  updateCollectionItem,
};
