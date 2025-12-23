import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assets, brands, collectionItems, collections, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateCollectionItemPayload, CreateCollectionPayload } from "./collection.interfaces";
import { collectionQueryValidationConfig, collectionSortableFields } from "./collection.utils";

// ----------------------------------- CREATE COLLECTION -----------------------------------
const createCollection = async (data: CreateCollectionPayload) => {
    try {
        // Step 1: Validate company exists and is not deleted
        const [company] = await db
            .select()
            .from(companies)
            .where(
                and(
                    eq(companies.id, data.company_id),
                    eq(companies.platform_id, data.platform_id),
                    isNull(companies.deleted_at)
                )
            );

        if (!company) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
        }

        // Step 2: If brand_id is provided, validate it exists and belongs to the company
        if (data.brand_id) {
            const [brand] = await db
                .select()
                .from(brands)
                .where(
                    and(
                        eq(brands.id, data.brand_id),
                        eq(brands.company_id, data.company_id),
                        eq(brands.platform_id, data.platform_id),
                        eq(brands.is_active, true)
                    )
                );

            if (!brand) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Brand not found or does not belong to this company"
                );
            }
        }

        // Step 3: Insert collection into database
        const [result] = await db.insert(collections).values(data).returning();
        return result;
    } catch (error: any) {
        throw error;
    }
};

// ----------------------------------- GET COLLECTIONS -------------------------------------
const getCollections = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        company_id,
        brand_id,
        category,
        include_inactive,
        include_deleted,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(collectionQueryValidationConfig, "sort_by", sort_by);
    if (sort_order)
        queryValidator(collectionQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
        paginationMaker({
            page,
            limit,
            sort_by,
            sort_order,
        });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(collections.platform_id, platformId)];

    // Step 3a: Filter by user role (CLIENT users see only their company's collections)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(collections.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3b: Search by collection name
    if (search_term) {
        conditions.push(
            ilike(collections.name, `%${search_term.trim()}%`)
        );
    }

    // Step 3c: Filter by company ID
    if (company_id) {
        conditions.push(eq(collections.company_id, company_id));
    }

    // Step 3d: Filter by brand ID
    if (brand_id) {
        conditions.push(eq(collections.brand_id, brand_id));
    }

    // Step 3e: Filter by category
    if (category) {
        conditions.push(eq(collections.category, category));
    }

    // Step 3f: Filter by active status (default: only active collections)
    if (include_inactive !== 'true') {
        conditions.push(eq(collections.is_active, true));
    }

    // Step 3g: Filter by deleted status (default: exclude deleted collections)
    if (include_deleted !== 'true') {
        conditions.push(isNull(collections.deleted_at));
    }

    // Step 4: Determine sort order
    const orderByColumn = collectionSortableFields[sortWith] || collections.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db.query.collections.findMany({
            where: and(...conditions),
            with: {
                company: {
                    columns: {
                        id: true,
                        name: true,
                        domain: true,
                    },
                },
                brand: {
                    columns: {
                        id: true,
                        name: true,
                        logo_url: true,
                    },
                },
            },
            orderBy: orderDirection,
            limit: limitNumber,
            offset: skip,
        }),

        db
            .select({
                count: count(),
            })
            .from(collections)
            .where(and(...conditions)),
    ]);

    // Step 6: Return paginated response
    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
        },
        data: result,
    };
};

// ----------------------------------- GET COLLECTION BY ID --------------------------------
const getCollectionById = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [
        eq(collections.id, id),
        eq(collections.platform_id, platformId),
        isNull(collections.deleted_at),
    ];

    // Step 2: Filter by user role (CLIENT users can only see their company's collections)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(collections.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3: Fetch collection with company, brand, and items
    const collection = await db.query.collections.findFirst({
        where: and(...conditions),
        with: {
            company: {
                columns: {
                    id: true,
                    name: true,
                    domain: true,
                },
            },
            brand: {
                columns: {
                    id: true,
                    name: true,
                    logo_url: true,
                },
            },
            assets: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            category: true,
                            images: true,
                            volume_per_unit: true,
                            weight_per_unit: true,
                            status: true,
                            condition: true,
                            qr_code: true,
                            available_quantity: true,
                            total_quantity: true,
                            handling_tags: true,
                        },
                    },
                },
                orderBy: (items, { asc }) => [asc(items.display_order)],
            },
        },
    });

    // Step 4: Handle not found
    if (!collection) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Collection not found");
    }

    return collection;
};

// ----------------------------------- UPDATE COLLECTION -----------------------------------
const updateCollection = async (id: string, data: any, platformId: string) => {
    try {
        // Step 1: Verify collection exists and user has access
        const conditions: any[] = [
            eq(collections.id, id),
            eq(collections.platform_id, platformId),
            isNull(collections.deleted_at),
        ];

        const [existingCollection] = await db
            .select()
            .from(collections)
            .where(and(...conditions));

        if (!existingCollection) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Collection not found");
        }

        // Step 2: If brand_id is being updated, validate it exists and belongs to the company
        if (data.brand_id) {
            const [brand] = await db
                .select()
                .from(brands)
                .where(
                    and(
                        eq(brands.id, data.brand_id),
                        eq(brands.company_id, existingCollection.company_id),
                        eq(brands.platform_id, platformId),
                        eq(brands.is_active, true)
                    )
                );

            if (!brand) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Brand not found or does not belong to this company"
                );
            }
        }

        // Step 3: Update collection
        const [result] = await db
            .update(collections)
            .set({
                ...data,
            })
            .where(eq(collections.id, id))
            .returning();

        return result;
    } catch (error: any) {
        throw error;
    }
};

// ----------------------------------- DELETE COLLECTION -----------------------------------
const deleteCollection = async (id: string, platformId: string) => {
    // Step 1: Verify collection exists and user has access
    const conditions: any[] = [
        eq(collections.id, id),
        eq(collections.platform_id, platformId),
        isNull(collections.deleted_at),
    ];

    const [existingCollection] = await db
        .select()
        .from(collections)
        .where(and(...conditions));

    if (!existingCollection) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Collection not found");
    }

    // Step 2: Soft delete collection (set deleted_at timestamp)
    await db
        .update(collections)
        .set({
            deleted_at: new Date(),
        })
        .where(eq(collections.id, id))
        .returning();

    return null;
};

// ----------------------------------- ADD COLLECTION ITEM -----------------------------------
const addCollectionItem = async (collectionId: string, data: CreateCollectionItemPayload, platformId: string) => {
    try {
        // Step 1: Verify collection exists and user has access
        const conditions: any[] = [
            eq(collections.id, collectionId),
            eq(collections.platform_id, platformId),
            isNull(collections.deleted_at),
        ];

        const [collection] = await db
            .select()
            .from(collections)
            .where(and(...conditions));

        if (!collection) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Collection not found");
        }

        // Step 2: Verify asset exists and belongs to the same company
        const [asset] = await db
            .select()
            .from(assets)
            .where(
                and(
                    eq(assets.id, data.asset_id),
                    eq(assets.company_id, collection.company_id),
                    eq(assets.platform_id, platformId),
                    isNull(assets.deleted_at)
                )
            );

        if (!asset) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Asset not found or does not belong to this company"
            );
        }

        // Step 3: Insert collection item
        const [result] = await db
            .insert(collectionItems)
            .values({
                collection: collectionId,
                asset: data.asset_id,
                default_quantity: data.default_quantity,
                notes: data.notes,
                display_order: data.display_order,
            })
            .returning();

        return result;
    } catch (error: any) {
        const pgError = error.cause || error;

        if (pgError.code === '23505') {
            if (pgError.constraint === 'collection_items_unique') {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    "This asset is already in the collection"
                );
            }
        }

        throw error;
    }
};

// ----------------------------------- UPDATE COLLECTION ITEM -----------------------------------
const updateCollectionItem = async (collectionId: string, itemId: string, data: any, platformId: string) => {
    try {
        // Step 1: Verify collection exists and user has access
        const conditions: any[] = [
            eq(collections.id, collectionId),
            eq(collections.platform_id, platformId),
            isNull(collections.deleted_at),
        ];

        const [collection] = await db
            .select()
            .from(collections)
            .where(and(...conditions));

        if (!collection) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Collection not found");
        }

        // Step 2: Verify collection item exists
        const [existingItem] = await db
            .select()
            .from(collectionItems)
            .where(
                and(
                    eq(collectionItems.id, itemId),
                    eq(collectionItems.collection, collectionId)
                )
            );

        if (!existingItem) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Collection item not found");
        }

        // Step 3: Update collection item
        const [result] = await db
            .update(collectionItems)
            .set({
                ...data,
            })
            .where(eq(collectionItems.id, itemId))
            .returning();

        return result;
    } catch (error: any) {
        throw error;
    }
};

// ----------------------------------- DELETE COLLECTION ITEM -----------------------------------
const deleteCollectionItem = async (collectionId: string, itemId: string, platformId: string) => {
    // Step 1: Verify collection exists and user has access
    const conditions: any[] = [
        eq(collections.id, collectionId),
        eq(collections.platform_id, platformId),
        isNull(collections.deleted_at),
    ];

    const [collection] = await db
        .select()
        .from(collections)
        .where(and(...conditions));

    if (!collection) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Collection not found");
    }

    // Step 2: Verify collection item exists
    const [existingItem] = await db
        .select()
        .from(collectionItems)
        .where(
            and(
                eq(collectionItems.id, itemId),
                eq(collectionItems.collection, collectionId)
            )
        );

    if (!existingItem) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Collection item not found");
    }

    // Step 3: Delete collection item
    await db
        .delete(collectionItems)
        .where(eq(collectionItems.id, itemId));

    return null;
};

// ----------------------------------- CHECK COLLECTION AVAILABILITY -----------------------------------
const checkCollectionAvailability = async (
    collectionId: string,
    user: AuthUser,
    platformId: string,
    query: any
) => {
    const { event_start_date, event_end_date } = query;
    // Validate required query parameters
    if (!event_start_date || !event_end_date) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "event_start_date and event_end_date are required in query parameters");
    }

    // Step 1: Build WHERE conditions
    const conditions: any[] = [
        eq(collections.id, collectionId),
        eq(collections.platform_id, platformId),
        isNull(collections.deleted_at),
    ];

    // Step 2: Filter by user role (CLIENT users can only check their company's collections)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(collections.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3: Fetch collection with items and asset details
    const collection = await db.query.collections.findFirst({
        where: and(...conditions),
        with: {
            assets: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            available_quantity: true,
                            total_quantity: true,
                            status: true,
                            condition: true,
                        },
                    },
                },
                orderBy: (items, { asc }) => [asc(items.display_order)],
            },
        },
    });

    // Step 4: Handle not found
    if (!collection) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Collection not found");
    }

    // Step 5: Check availability for each item
    const availabilityItems = collection.assets.map((item) => {
        const isAvailable = item.asset.available_quantity >= item.default_quantity;

        return {
            asset_id: item.asset.id,
            asset_name: item.asset.name,
            default_quantity: item.default_quantity,
            available_quantity: item.asset.available_quantity,
            total_quantity: item.asset.total_quantity,
            status: item.asset.status,
            condition: item.asset.condition,
            is_available: isAvailable,
        };
    });

    // Step 6: Determine if collection is fully available
    const isFullyAvailable = availabilityItems.every((item) => item.is_available);

    return {
        collection_id: collectionId,
        collection_name: collection.name,
        event_start_date: event_start_date,
        event_end_date: event_end_date,
        is_fully_available: isFullyAvailable,
        items: availabilityItems,
    };
};

export const CollectionServices = {
    createCollection,
    getCollections,
    getCollectionById,
    updateCollection,
    deleteCollection,
    addCollectionItem,
    updateCollectionItem,
    deleteCollectionItem,
    checkCollectionAvailability,
};
