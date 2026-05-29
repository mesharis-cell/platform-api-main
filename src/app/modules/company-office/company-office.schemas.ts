import { z } from "zod";

/**
 * Company Back Office asset edit — the ONLY editable fields are the five
 * presentation fields. `.strict()` rejects any other key outright (defense in
 * depth on top of the service-layer allowlist). All fields optional so a
 * partial edit is valid; the service rejects an empty body.
 */
const companyEditAssetSchema = z.object({
    body: z
        .object({
            name: z
                .string("Name should be a text")
                .trim()
                .min(1, "Name cannot be empty")
                .max(200, "Name must be at most 200 characters")
                .optional(),
            description: z.string("Description should be a text").nullable().optional(),
            category: z
                .string("Category should be a text")
                .trim()
                .min(1, "Category cannot be empty")
                .max(100, "Category must be at most 100 characters")
                .optional(),
            brand_id: z.string().uuid("brand_id must be a valid UUID").nullable().optional(),
            on_display_image: z
                .string("On-display image should be a URL")
                .url("On-display image must be a valid URL")
                .nullable()
                .optional(),
        })
        .strict(),
});

export const CompanyOfficeSchemas = {
    companyEditAssetSchema,
};
