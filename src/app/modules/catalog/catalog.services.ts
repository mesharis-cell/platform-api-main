import { and, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assetCategories, assets, collections, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import { CatalogResult } from "./catalog.interfaces";

type AssetRow = any;
type CollectionRow = any;

const CONDITION_RANK: Record<string, number> = { GREEN: 0, ORANGE: 1, RED: 2 };

const imageUrlFromAsset = (asset: AssetRow): string | null => {
    if (asset.on_display_image) return asset.on_display_image;
    const images = Array.isArray(asset.images) ? asset.images : [];
    const first = images[0] as { url?: string } | undefined;
    return typeof first?.url === "string" ? first.url : null;
};

const imageUrlsFromGroupMedia = (images: unknown): string[] => {
    if (!Array.isArray(images)) return [];
    return images
        .map((image) => {
            if (typeof image === "string") return image;
            if (image && typeof image === "object" && typeof (image as any).url === "string") {
                return (image as any).url as string;
            }
            return null;
        })
        .filter((url): url is string => Boolean(url));
};

const sortedSiblings = (siblings: AssetRow[]) =>
    siblings.slice().sort((a, b) => {
        const aAvailable = Number(a.available_quantity || 0) > 0 ? 0 : 1;
        const bAvailable = Number(b.available_quantity || 0) > 0 ? 0 : 1;
        if (aAvailable !== bAvailable) return aAvailable - bAvailable;

        const conditionDelta =
            (CONDITION_RANK[a.condition] ?? 99) - (CONDITION_RANK[b.condition] ?? 99);
        if (conditionDelta !== 0) return conditionDelta;

        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

const projectRawAsset = (asset: AssetRow) => ({
    type: "asset" as const,
    id: asset.id,
    asset_id: asset.id,
    name: asset.name,
    description: asset.description,
    category: asset.category,
    group_id: asset.group_id,
    group_name: asset.group_name,
    stock_mode: asset.stock_mode,
    images: imageUrlFromAsset(asset) ? [imageUrlFromAsset(asset)!] : [],
    raw_images: asset.images,
    on_display_image: asset.on_display_image,
    brand: asset.brand ? { id: asset.brand.id, name: asset.brand.name } : null,
    team: asset.team ? { id: asset.team.id, name: asset.team.name } : null,
    available_quantity: Number(asset.available_quantity || 0),
    total_quantity: Number(asset.total_quantity || 0),
    condition: asset.condition,
    condition_notes: asset.condition_notes,
    refurb_days_estimate: asset.refurb_days_estimate,
    status: asset.status,
    volume_per_unit: String(asset.volume_per_unit || 0),
    weight_per_unit: String(asset.weight_per_unit || 0),
    dimensions: asset.dimensions || {},
    packaging: asset.packaging,
    created_at: asset.created_at,
});

const projectGroup = (groupId: string, siblings: AssetRow[]) => {
    const ordered = sortedSiblings(siblings);
    const first = ordered[0];
    const groupImages = imageUrlsFromGroupMedia(first.group_images);
    const hero = first.group_on_display_image || groupImages[0] || null;
    const siblingThumbnails = ordered
        .map(imageUrlFromAsset)
        .filter((url): url is string => Boolean(url))
        .slice(0, 3);

    const available = siblings.reduce(
        (sum, asset) => sum + Number(asset.available_quantity || 0),
        0
    );
    const total = siblings.reduce((sum, asset) => sum + Number(asset.total_quantity || 0), 0);

    const conditionSummary = siblings.reduce(
        (summary, asset) => {
            const key = asset.condition.toLowerCase() as "green" | "orange" | "red";
            summary[key] += 1;
            return summary;
        },
        { green: 0, orange: 0, red: 0 }
    );

    return {
        type: "group" as const,
        id: groupId,
        group_id: groupId,
        name: first.group_name || first.name,
        group_name: first.group_name,
        description: first.description,
        category: first.category,
        stock_mode: first.stock_mode,
        brand: first.brand ? { id: first.brand.id, name: first.brand.name } : null,
        team: first.team ? { id: first.team.id, name: first.team.name } : null,
        group_images: first.group_images,
        group_on_display_image: first.group_on_display_image,
        images: hero ? [hero] : siblingThumbnails,
        sibling_thumbnails: siblingThumbnails,
        sibling_count: siblings.length,
        available_quantity: available,
        total_quantity: total,
        condition_summary: conditionSummary,
        volume_per_unit: String(first.volume_per_unit || 0),
        weight_per_unit: String(first.weight_per_unit || 0),
        dimensions: first.dimensions || {},
        packaging: first.packaging,
        created_at: first.created_at,
        siblings: ordered.map(projectRawAsset),
    };
};

const projectCollection = (collection: CollectionRow) => ({
    type: "collection" as const,
    id: collection.id,
    name: collection.name,
    description: collection.description,
    category: collection.category,
    images: collection.images || [],
    brand: collection.brand ? { id: collection.brand.id, name: collection.brand.name } : null,
    team: collection.team ? { id: collection.team.id, name: collection.team.name } : null,
    item_count: Array.isArray(collection.assets) ? collection.assets.length : 0,
    created_at: collection.created_at,
});

const paginateItems = (items: any[], pageNumber: number, limitNumber: number) => {
    const start = (pageNumber - 1) * limitNumber;
    return items.slice(start, start + limitNumber);
};

const getCatalog = async (
    query: Record<string, unknown>,
    user: any,
    platformId: string
): Promise<CatalogResult> => {
    const brandId = (query.brand_id as string) || (query.brand as string) || undefined;
    const categoryId = (query.category_id as string) || undefined;
    const categoryQuery = (query.category as string) || undefined;
    const groupId = (query.group_id as string) || undefined;
    const teamId = (query.team_id as string) || (query.team as string) || undefined;
    const searchTerm = ((query.search_term as string) || (query.search as string) || "").trim();
    const rawAssets = query.raw_assets === "true" || query.raw_assets === true;
    const requestedType = (query.type as string) || "all";
    const type =
        requestedType === "collection"
            ? "collection"
            : requestedType === "asset" || requestedType === "family"
              ? "asset"
              : "all";

    const { pageNumber, limitNumber } = paginationMaker({
        page: Number(query.page) || undefined,
        limit: Number(query.limit) || undefined,
    });

    const finalCompanyId = user.company_id;
    if (!finalCompanyId) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "User is not associated with any company"
        );
    }

    const [company] = await db
        .select()
        .from(companies)
        .where(
            and(
                eq(companies.id, finalCompanyId),
                eq(companies.platform_id, platformId),
                isNull(companies.deleted_at)
            )
        );

    if (!company) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Company not found or invalid for this platform"
        );
    }

    let categoryName = categoryQuery;
    if (categoryId) {
        const [category] = await db
            .select({ name: assetCategories.name })
            .from(assetCategories)
            .where(
                and(
                    eq(assetCategories.id, categoryId),
                    eq(assetCategories.platform_id, platformId),
                    eq(assetCategories.is_active, true)
                )
            )
            .limit(1);
        categoryName = category?.name;
    }

    const assetConditions: any[] = [
        eq(assets.platform_id, platformId),
        eq(assets.company_id, finalCompanyId as string),
        ne(assets.status, "TRANSFORMED"),
        isNull(assets.deleted_at),
    ];
    if (brandId) assetConditions.push(eq(assets.brand_id, brandId));
    if (teamId) assetConditions.push(eq(assets.team_id, teamId));
    if (categoryName) assetConditions.push(eq(assets.category, categoryName));
    if (groupId) assetConditions.push(eq(assets.group_id, groupId));
    if (searchTerm) {
        const term = `%${searchTerm}%`;
        assetConditions.push(
            or(
                ilike(assets.name, term),
                ilike(assets.description, term),
                ilike(assets.qr_code, term),
                ilike(assets.group_name, term)
            )
        );
    }

    const collectionConditions: any[] = [
        eq(collections.platform_id, platformId),
        eq(collections.company_id, finalCompanyId as string),
        eq(collections.is_active, true),
        isNull(collections.deleted_at),
    ];
    if (brandId) collectionConditions.push(eq(collections.brand_id, brandId));
    if (teamId) collectionConditions.push(eq(collections.team_id, teamId));
    if (categoryName) collectionConditions.push(eq(collections.category, categoryName));
    if (searchTerm) {
        const term = `%${searchTerm}%`;
        collectionConditions.push(
            or(ilike(collections.name, term), ilike(collections.description, term))
        );
    }

    const [assetRows, collectionRows] = await Promise.all([
        type === "collection"
            ? Promise.resolve([])
            : db.query.assets.findMany({
                  where: and(...assetConditions),
                  orderBy: [desc(assets.created_at)],
                  with: {
                      brand: true,
                      team: true,
                  },
              }),
        type === "asset"
            ? Promise.resolve([])
            : db.query.collections.findMany({
                  where: and(...collectionConditions),
                  orderBy: [desc(collections.created_at)],
                  with: {
                      brand: true,
                      team: true,
                      assets: {
                          where: (item, { isNull }) => isNull(item.deleted_at),
                      },
                  },
              }),
    ]);

    const groupedAssets = new Map<string, AssetRow[]>();
    const assetItems: any[] = [];
    for (const asset of assetRows) {
        if (asset.group_id && !rawAssets) {
            const siblings = groupedAssets.get(asset.group_id) || [];
            siblings.push(asset);
            groupedAssets.set(asset.group_id, siblings);
        } else {
            assetItems.push(projectRawAsset(asset));
        }
    }

    for (const [assetGroupId, siblings] of groupedAssets.entries()) {
        if (siblings.length > 1) {
            assetItems.push(projectGroup(assetGroupId, siblings));
        } else {
            assetItems.push(projectRawAsset(siblings[0]));
        }
    }

    const collectionItems = collectionRows.map(projectCollection);
    const items =
        type === "asset"
            ? assetItems
            : type === "collection"
              ? collectionItems
              : [...assetItems, ...collectionItems];

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const pagedItems = paginateItems(items, pageNumber, limitNumber);

    return {
        items: pagedItems,
        assets: assetItems,
        collections: collectionItems,
        meta: {
            total: items.length,
            total_assets: assetItems.length,
            total_grouped_assets: assetItems.filter((item) => item.type === "group").length,
            total_raw_assets: assetItems.filter((item) => item.type === "asset").length,
            total_collections: collectionItems.length,
            page: pageNumber,
            limit: limitNumber,
            total_pages: Math.max(1, Math.ceil(items.length / limitNumber)),
        },
    };
};

export const CatalogServices = {
    getCatalog,
};
