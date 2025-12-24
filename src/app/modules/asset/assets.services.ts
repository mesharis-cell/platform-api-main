import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assets, brands, companies, warehouses, zones } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateAssetPayload } from "./assets.interfaces";
import { assetQueryValidationConfig, assetSortableFields } from "./assets.utils";

// ----------------------------------- HELPER: GENERATE UNIQUE QR CODE ----------------
const generateUniqueQRCode = async (baseQRCode: string, platformId: string): Promise<string> => {
    let qrCode = baseQRCode;
    let counter = 1;

    // Check if QR code exists
    while (true) {
        const [existing] = await db
            .select()
            .from(assets)
            .where(
                and(
                    eq(assets.qr_code, qrCode),
                    eq(assets.platform_id, platformId)
                )
            )
            .limit(1);

        if (!existing) {
            return qrCode;
        }

        // Generate new QR code with suffix
        qrCode = `${baseQRCode}-${counter}`;
        counter++;
    }
};

// ----------------------------------- CREATE ASSET -----------------------------------
const createAsset = async (data: CreateAssetPayload, user: AuthUser) => {
    try {
        // Step 1: Validate company, warehouse and zone exists and is not archived
        const [[company], [warehouse], [zone]] = await Promise.all([
            db
                .select()
                .from(companies)
                .where(
                    and(
                        eq(companies.id, data.company_id),
                        eq(companies.platform_id, data.platform_id),
                        isNull(companies.deleted_at)
                    )
                ),
            db
                .select()
                .from(warehouses)
                .where(
                    and(
                        eq(warehouses.id, data.warehouse_id),
                        eq(warehouses.platform_id, data.platform_id)
                    )
                ),
            db
                .select()
                .from(zones)
                .where(
                    and(
                        eq(zones.id, data.zone_id),
                        eq(zones.warehouse_id, data.warehouse_id),
                        eq(zones.company_id, data.company_id)
                    )
                )
        ]);

        if (!company) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
        }

        if (!warehouse) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
        }

        if (!zone) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Zone not found or does not belong to the specified warehouse and company");
        }

        // Step 2: Validate brand if provided
        if (data.brand_id) {
            const [brand] = await db
                .select()
                .from(brands)
                .where(
                    and(
                        eq(brands.id, data.brand_id),
                        eq(brands.company_id, data.company_id)
                    )
                );

            if (!brand) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Brand not found or does not belong to the specified company");
            }
        }

        // Step 3: Handle INDIVIDUAL tracking with quantity > 1 - Create N separate assets
        if (data.tracking_method === 'INDIVIDUAL' && data.total_quantity > 1) {
            const createdAssets: any[] = [];

            for (let i = 0; i < data.total_quantity; i++) {
                // Generate unique QR code for each unit
                const qrCode = await generateUniqueQRCode(data.qr_code, data.platform_id);

                // Create initial condition history entry
                const initialConditionHistory = [];
                if (data.condition_notes || (data.condition && data.condition !== 'GREEN')) {
                    initialConditionHistory.push({
                        condition: data.condition || 'GREEN',
                        notes: data.condition_notes || 'Initial condition',
                        updated_by: user.id,
                        timestamp: new Date().toISOString(),
                    });
                }

                // Create individual asset with quantity=1
                const [asset] = await db
                    .insert(assets)
                    .values({
                        platform_id: data.platform_id,
                        company_id: data.company_id,
                        warehouse_id: data.warehouse_id,
                        zone_id: data.zone_id,
                        brand_id: data.brand_id || null,
                        name: `${data.name} #${i + 1}`, // Add unit number to name
                        description: data.description || null,
                        category: data.category,
                        images: data.images || [],
                        tracking_method: 'INDIVIDUAL',
                        total_quantity: 1, // Each individual unit has quantity 1
                        available_quantity: 1,
                        qr_code: qrCode,
                        packaging: null, // Individual items don't have packaging
                        weight_per_unit: data.weight_per_unit.toString(),
                        dimensions: data.dimensions || {},
                        volume_per_unit: data.volume_per_unit.toString(),
                        condition: data.condition || 'GREEN',
                        condition_notes: data.condition_notes || null,
                        refurb_days_estimate: data.refurb_days_estimate || null,
                        condition_history: initialConditionHistory,
                        handling_tags: data.handling_tags || [],
                        status: data.status || 'AVAILABLE',
                    })
                    .returning();

                createdAssets.push(asset);
            }

            // Return first asset as primary, with metadata about batch creation
            return {
                ...createdAssets[0],
                meta: {
                    assets_created: createdAssets.length,
                    message: `Created ${createdAssets.length} individual assets`,
                },
            };
        }

        // Step 4: INDIVIDUAL tracking with quantity=1 OR BATCH tracking - Create single asset
        const qrCode = await generateUniqueQRCode(data.qr_code, data.platform_id);

        // Create initial condition history entry
        const initialConditionHistory = [];
        if (data.condition_notes || (data.condition && data.condition !== 'GREEN')) {
            initialConditionHistory.push({
                condition: data.condition || 'GREEN',
                notes: data.condition_notes || 'Initial condition',
                updated_by: user.id,
                timestamp: new Date().toISOString(),
            });
        }

        const dbData = {
            ...data,
            qr_code: qrCode,
            weight_per_unit: data.weight_per_unit.toString(),
            volume_per_unit: data.volume_per_unit.toString(),
            brand_id: data.brand_id || null,
            description: data.description || null,
            images: data.images || [],
            packaging: data.packaging || null,
            dimensions: data.dimensions || {},
            condition: data.condition || 'GREEN',
            condition_notes: data.condition_notes || null,
            refurb_days_estimate: data.refurb_days_estimate || null,
            condition_history: initialConditionHistory,
            handling_tags: data.handling_tags || [],
            status: data.status || 'AVAILABLE',
        };

        const [result] = await db.insert(assets).values(dbData).returning();
        return result;
    } catch (error: any) {
        // Step 5: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === '23505') {
            if (pgError.constraint === 'assets_qr_code_key') {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Asset with QR code "${data.qr_code}" already exists`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                'An asset with these details already exists'
            );
        }

        throw error;
    }
};

// ----------------------------------- GET ASSETS -------------------------------------
const getAssets = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        company_id,
        warehouse_id,
        zone_id,
        brand_id,
        category,
        tracking_method,
        condition,
        status,
        include_inactive,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(assetQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(assetQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(assets.platform_id, platformId)];

    // Step 3a: Filter by user role (CLIENT users see only their company's assets)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3b: Search by asset name
    if (search_term) {
        conditions.push(ilike(assets.name, `%${search_term.trim()}%`));
    }

    // Step 3c: Filter by company ID
    if (company_id) {
        conditions.push(eq(assets.company_id, company_id));
    }

    // Step 3d: Filter by warehouse ID
    if (warehouse_id) {
        conditions.push(eq(assets.warehouse_id, warehouse_id));
    }

    // Step 3e: Filter by zone ID
    if (zone_id) {
        conditions.push(eq(assets.zone_id, zone_id));
    }

    // Step 3f: Filter by brand ID
    if (brand_id) {
        conditions.push(eq(assets.brand_id, brand_id));
    }

    // Step 3g: Filter by category
    if (category) {
        conditions.push(eq(assets.category, category));
    }

    // Step 3h: Filter by tracking method
    if (tracking_method) {
        conditions.push(eq(assets.tracking_method, tracking_method));
    }

    // Step 3i: Filter by condition
    if (condition) {
        conditions.push(eq(assets.condition, condition));
    }

    // Step 3j: Filter by status
    if (status) {
        conditions.push(eq(assets.status, status));
    }

    // Step 3k: Filter by deleted status (default: only active assets)
    if (include_inactive !== 'true') {
        conditions.push(isNull(assets.deleted_at));
    }

    // Step 4: Determine sort order
    const orderByColumn = assetSortableFields[sortWith] || assets.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db.query.assets.findMany({
            where: and(...conditions),
            with: {
                company: {
                    columns: {
                        id: true,
                        name: true,
                        domain: true,
                    },
                },
                warehouse: {
                    columns: {
                        id: true,
                        name: true,
                        city: true,
                        country: true,
                    },
                },
                zone: {
                    columns: {
                        id: true,
                        name: true,
                    },
                },
                brand: {
                    columns: {
                        id: true,
                        name: true,
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
            .from(assets)
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

// ----------------------------------- GET ASSET BY ID --------------------------------
const getAssetById = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // Step 2: Filter by user role (CLIENT users can only see their company's assets)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3: Fetch asset with related information
    const asset = await db.query.assets.findFirst({
        where: and(...conditions),
        with: {
            company: {
                columns: {
                    id: true,
                    name: true,
                    domain: true,
                },
            },
            warehouse: {
                columns: {
                    id: true,
                    name: true,
                    city: true,
                    country: true,
                },
            },
            zone: {
                columns: {
                    id: true,
                    name: true,
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
    });

    // Step 4: Handle not found
    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Step 5: Extract latest condition notes from condition_history JSONB
    let latestConditionNotes: string | undefined = undefined;
    if (asset.condition_history && Array.isArray(asset.condition_history) && asset.condition_history.length > 0) {
        // Sort condition_history by timestamp desc to get the most recent entry first
        const sortedHistory = [...asset.condition_history].sort((a: any, b: any) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeB - timeA;
        });

        const latestHistory = sortedHistory[0];
        if (latestHistory && typeof latestHistory === 'object' && 'notes' in latestHistory) {
            latestConditionNotes = (latestHistory as any).notes;
        }
    }

    // Step 6: Return asset with enhanced details
    return {
        ...asset,
        latest_condition_notes: latestConditionNotes,
        company_details: {
            id: asset.company.id,
            name: asset.company.name,
            domain: asset.company.domain,
        },
        warehouse_details: {
            id: asset.warehouse.id,
            name: asset.warehouse.name,
            city: asset.warehouse.city,
            country: asset.warehouse.country,
        },
        zone_details: {
            id: asset.zone.id,
            name: asset.zone.name,
        },
        brand_details: asset.brand ? {
            id: asset.brand.id,
            name: asset.brand.name,
            logo_url: asset.brand.logo_url,
        } : null,
    };
};

// ----------------------------------- UPDATE ASSET -----------------------------------
const updateAsset = async (id: string, data: any, user: AuthUser, platformId: string) => {
    try {
        // Step 1: Verify asset exists and user has access
        const conditions: any[] = [
            eq(assets.id, id),
            eq(assets.platform_id, platformId),
            isNull(assets.deleted_at),
        ];

        const [existingAsset] = await db
            .select()
            .from(assets)
            .where(and(...conditions));

        if (!existingAsset) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
        }

        // Step 2: Validate company if being updated
        if (data.company_id && existingAsset.company_id !== data.company_id) {
            const [company] = await db
                .select()
                .from(companies)
                .where(
                    and(
                        eq(companies.id, data.company_id),
                        eq(companies.platform_id, platformId),
                        isNull(companies.deleted_at)
                    )
                );

            if (!company) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
            }
        }

        // Step 3: Validate warehouse if being updated
        if (data.warehouse_id && existingAsset.warehouse_id !== data.warehouse_id) {
            const [warehouse] = await db
                .select()
                .from(warehouses)
                .where(
                    and(
                        eq(warehouses.id, data.warehouse_id),
                        eq(warehouses.platform_id, platformId)
                    )
                );

            if (!warehouse) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
            }
        }

        // Step 4: Validate zone if being updated
        if (data.zone_id && existingAsset.zone_id !== data.zone_id) {
            const targetCompanyId = data.company_id || existingAsset.company_id;
            const targetWarehouseId = data.warehouse_id || existingAsset.warehouse_id;

            const [zone] = await db
                .select()
                .from(zones)
                .where(
                    and(
                        eq(zones.id, data.zone_id),
                        eq(zones.warehouse_id, targetWarehouseId),
                        eq(zones.company_id, targetCompanyId)
                    )
                );

            if (!zone) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Zone not found or does not belong to the specified warehouse and company");
            }
        }

        // Step 5: Validate brand if being updated
        if (data.brand_id && existingAsset.brand_id !== data.brand_id) {
            const targetCompanyId = data.company_id || existingAsset.company_id;

            const [brand] = await db
                .select()
                .from(brands)
                .where(
                    and(
                        eq(brands.id, data.brand_id),
                        eq(brands.company_id, targetCompanyId)
                    )
                );

            if (!brand) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Brand not found or does not belong to the specified company");
            }
        }

        // Step 6: Validate quantity constraints if either is being updated
        if (data.total_quantity !== undefined || data.available_quantity !== undefined) {
            const finalTotalQty = data.total_quantity !== undefined ? data.total_quantity : parseInt(existingAsset.total_quantity.toString());
            const finalAvailableQty = data.available_quantity !== undefined ? data.available_quantity : parseInt(existingAsset.available_quantity.toString());

            if (finalAvailableQty > finalTotalQty) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "Available quantity cannot exceed total quantity"
                );
            }
        }

        // Step 7: Build update data with decimal conversions
        const dbData: any = { ...data };
        if (data.weight_per_unit !== undefined) {
            dbData.weight_per_unit = data.weight_per_unit.toString();
        }
        if (data.volume_per_unit !== undefined) {
            dbData.volume_per_unit = data.volume_per_unit.toString();
        }

        // Step 8: Handle condition changes
        if (data.condition !== undefined && data.condition !== existingAsset.condition) {
            // Clear refurb estimate if changing to GREEN
            if (data.condition === 'GREEN') {
                dbData.refurb_days_estimate = null;
            }

            // Add condition change to history
            const existingHistory = Array.isArray(existingAsset.condition_history)
                ? existingAsset.condition_history
                : [];

            const newHistoryEntry = {
                condition: data.condition,
                notes: data.condition_notes || null,
                updated_by: user.id,
                timestamp: new Date().toISOString(),
            };

            dbData.condition_history = [newHistoryEntry, ...existingHistory];
        }

        // Step 9: Update asset
        const [result] = await db
            .update(assets)
            .set(dbData)
            .where(eq(assets.id, id))
            .returning();

        return result;
    } catch (error: any) {
        // Step 10: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === '23505') {
            if (pgError.constraint === 'assets_qr_code_key') {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Asset with QR code "${data.qr_code}" already exists`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                'An asset with these details already exists'
            );
        }

        throw error;
    }
};

// ----------------------------------- DELETE ASSET -----------------------------------
const deleteAsset = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Verify asset exists
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    const [existingAsset] = await db
        .select()
        .from(assets)
        .where(and(...conditions));

    if (!existingAsset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Step 2: Check if asset is referenced by any order items
    // const [orderItemReference] = await db
    //     .select()
    //     .from(orderItems)
    //     .where(eq(orderItems.asset_id, id))
    //     .limit(1);

    // if (orderItemReference) {
    //     throw new CustomizedError(
    //         httpStatus.CONFLICT,
    //         "Cannot delete asset because it is referenced by existing orders. You can deactivate it by setting status to MAINTENANCE instead."
    //     );
    // }

    // Step 3: Check if asset is currently booked
    const bookings = await db.query.assetBookings.findFirst({
        where: eq(assets.id, id),
    })

    if (bookings) {
        throw new CustomizedError(httpStatus.CONFLICT, 'Cannot delete asset that has active bookings')
    }

    // Step 4: Soft delete asset (set deleted_at timestamp)
    await db
        .update(assets)
        .set({
            deleted_at: new Date(),
        })
        .where(eq(assets.id, id));

    return null;
};

export const AssetServices = {
    createAsset,
    getAssets,
    getAssetById,
    updateAsset,
    deleteAsset,
};
