import { db } from "../index";
import * as schema from "../schema";
import { DEMO_UUIDS } from "./demo-deterministic";

export type SeedAssetCategoriesOpts = {
    platformId: string;
};

export const CANONICAL_ASSET_CATEGORIES = [
    {
        id: DEMO_UUIDS.assetCategories.furniture,
        name: "Furniture",
        slug: "furniture",
        color: "#3B7A57",
        sort_order: 0,
    },
    {
        id: DEMO_UUIDS.assetCategories.glassware,
        name: "Glassware",
        slug: "glassware",
        color: "#4A6FA5",
        sort_order: 1,
    },
    {
        id: DEMO_UUIDS.assetCategories.installation,
        name: "Installation",
        slug: "installation",
        color: "#8B6914",
        sort_order: 2,
    },
    {
        id: DEMO_UUIDS.assetCategories.decor,
        name: "Decor",
        slug: "decor",
        color: "#7B4B94",
        sort_order: 3,
    },
    {
        id: DEMO_UUIDS.assetCategories.general,
        name: "General",
        slug: "general",
        color: "#5A5A5A",
        sort_order: 4,
    },
    {
        id: DEMO_UUIDS.assetCategories.unknown,
        name: "Unknown",
        slug: "unknown",
        color: "#888888",
        sort_order: 5,
    },
] as const;

export const seedAssetCategories = async (opts: SeedAssetCategoriesOpts): Promise<void> => {
    await db.insert(schema.assetCategories).values(
        CANONICAL_ASSET_CATEGORIES.map((c) => ({
            id: c.id,
            platform_id: opts.platformId,
            company_id: null,
            name: c.name,
            slug: c.slug,
            color: c.color,
            sort_order: c.sort_order,
            is_active: true,
        }))
    );
};
