import { z } from "zod";
import { assetImageSchema } from "../asset/asset.schemas";

/**
 * Company Back Office asset edit. `.strict()` rejects any other key outright
 * (defense in depth on top of the service-layer allowlist). All fields optional
 * so a partial edit is valid; the service rejects an empty body.
 *
 * Presentation fields: name, description, category, brand_id, on_display_image.
 * Lone-asset gallery: `images` (jsonb, tagged source:'CLIENT' by the service).
 * Grouped gallery + rename: `group_name` / `group_images` / `group_on_display_image`
 * cascade to all siblings of the group (service detects group_id and re-derives
 * each sibling's `#N` name when group_name changes).
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
            images: z.array(assetImageSchema).optional(),
            group_name: z
                .string("Group name should be a text")
                .trim()
                .min(1, "Group name cannot be empty")
                .max(200, "Group name must be at most 200 characters")
                .optional(),
            group_images: z.array(assetImageSchema).optional(),
            group_on_display_image: z
                .string("Group on-display image should be a URL")
                .url("Group on-display image must be a valid URL")
                .nullable()
                .optional(),
        })
        .strict(),
});

export const CompanyOfficeSchemas = {
    companyEditAssetSchema,
};
