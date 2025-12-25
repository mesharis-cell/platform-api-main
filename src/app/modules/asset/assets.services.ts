import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, sql } from "drizzle-orm";
import httpStatus from "http-status";
import Papa from "papaparse";
import { db } from "../../../db";
import { assetBookings, assets, brands, companies, orders, scanEvents, warehouses, zones } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import {
    BulkUploadResponse,
    CreateAssetPayload,
    ForeignKeyCache,
    ParsedCSVRow,
    RowValidationError,
    ValidatedAssetData,
    ValidationResult
} from "./assets.interfaces";
import { assetQueryValidationConfig, assetSortableFields } from "./assets.utils";

// ----------------------------------- CREATE ASSET ---------------------------------------
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

// ----------------------------------- GET ASSETS -----------------------------------------
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

// ----------------------------------- GET ASSET BY ID ------------------------------------
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

// ----------------------------------- UPDATE ASSET ---------------------------------------
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

// ----------------------------------- DELETE ASSET ---------------------------------------
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

// ----------------------------------- GET ASSET AVAILABILITY STATS -----------------------
const getAssetAvailabilityStats = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Get asset with access control
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // CLIENT users can only see their company's assets
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    const asset = await db.query.assets.findFirst({
        where: and(...conditions),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    const totalQuantity = asset.total_quantity;

    // Step 2: Calculate BOOKED quantity from active bookings
    const activeBookings = await db
        .select({
            quantity: assetBookings.quantity,
        })
        .from(assetBookings)
        .innerJoin(orders, eq(assetBookings.order, orders.id))
        .where(
            and(
                eq(assetBookings.asset, id),
                inArray(orders.order_status, [
                    'CONFIRMED',
                    'IN_PREPARATION',
                    'READY_FOR_DELIVERY',
                    'IN_TRANSIT',
                    'DELIVERED',
                    'IN_USE',
                    'AWAITING_RETURN',
                ])
            )
        );

    const bookedQuantity = activeBookings.reduce(
        (sum, booking) => sum + booking.quantity,
        0
    );

    // Step 3: Calculate OUT quantity from scan events
    const outboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(
            and(
                eq(scanEvents.asset_id, id),
                eq(scanEvents.scan_type, 'OUTBOUND')
            )
        );

    const inboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(
            and(
                eq(scanEvents.asset_id, id),
                eq(scanEvents.scan_type, 'INBOUND')
            )
        );

    const totalOutbound = outboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const totalInbound = inboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const outQuantity = Math.max(0, totalOutbound - totalInbound);

    // Step 4: Calculate IN_MAINTENANCE quantity
    let inMaintenanceQuantity = 0;
    if (asset.condition === 'RED') {
        inMaintenanceQuantity = totalQuantity;
    }

    // Step 5: Calculate AVAILABLE quantity
    const availableQuantity = Math.max(
        0,
        totalQuantity - bookedQuantity - outQuantity - inMaintenanceQuantity
    );

    return {
        asset_id: id,
        total_quantity: totalQuantity,
        available_quantity: availableQuantity,
        booked_quantity: bookedQuantity,
        out_quantity: outQuantity,
        in_maintenance_quantity: inMaintenanceQuantity,
        breakdown: {
            active_bookings_count: activeBookings.length,
            outbound_scans_total: totalOutbound,
            inbound_scans_total: totalInbound,
        },
    };
};

// ----------------------------------- GET ASSET SCAN HISTORY -----------------------------
const getAssetScanHistory = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Verify asset exists and user has access
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // CLIENT users can only see their company's assets
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    const asset = await db.query.assets.findFirst({
        where: and(...conditions),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Step 2: Get scan history for the asset
    const events = await db.query.scanEvents.findMany({
        where: eq(scanEvents.asset_id, id),
        with: {
            asset: {
                columns: {
                    id: true,
                    name: true,
                    qr_code: true,
                    tracking_method: true,
                }
            },
            scanned_by_user: {
                columns: {
                    id: true,
                    name: true,
                }
            },
            order: {
                columns: {
                    id: true,
                    order_id: true,
                }
            },
        },
        orderBy: (scanEvents, { desc }) => [desc(scanEvents.scanned_at)],
    });

    // Step 3: Return scan history
    return {
        asset_id: id,
        asset_name: asset.name,
        qr_code: asset.qr_code,
        scan_history: events,
    };
};

// ----------------------------------- GET BATCH AVAILABILITY -----------------------------
const getBatchAvailability = async (assetIds: string[], user: AuthUser, platformId: string) => {
    // Step 1: Build query conditions
    const conditions: any[] = [
        inArray(assets.id, assetIds),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // CLIENT users can only see their company's assets
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 2: Fetch assets with availability info
    const foundAssets = await db
        .select({
            id: assets.id,
            name: assets.name,
            status: assets.status,
            available_quantity: assets.total_quantity, // Placeholder - real availability needs date-based calculation
            volume_per_unit: assets.volume_per_unit,
            weight_per_unit: assets.weight_per_unit,
        })
        .from(assets)
        .where(and(...conditions));

    return foundAssets;
};

// ----------------------------------- CHECK ASSET AVAILABILITY ---------------------------
const checkAssetAvailability = async (data: any, user: AuthUser, platformId: string) => {
    const { start_date, end_date, asset_id, asset_ids, items } = data;

    // Parse and validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date format");
    }

    if (endDate < startDate) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "End date must be after start date");
    }

    // Single asset check
    if (asset_id) {
        return await getSingleAssetAvailability(asset_id, startDate, endDate, user, platformId);
    }

    // Multiple assets check (cart validation)
    if (items && Array.isArray(items)) {
        return await checkMultipleAssetsAvailability(items, startDate, endDate, user, platformId);
    }

    // Batch asset summary check
    if (asset_ids && Array.isArray(asset_ids)) {
        const summaries = await Promise.all(
            asset_ids.map(async (id: string) => {
                const summary = await getAssetAvailabilitySummary(id, startDate, endDate, user, platformId);
                return {
                    asset_id: id,
                    ...summary,
                };
            })
        );
        return { assets: summaries };
    }

    throw new CustomizedError(httpStatus.BAD_REQUEST, "Either asset_id, asset_ids, or items array is required");
};

// ----------------------------------- HELPER: GET SINGLE ASSET AVAILABILITY --------------
const getSingleAssetAvailability = async (
    assetId: string,
    startDate: Date,
    endDate: Date,
    user: AuthUser,
    platformId: string
) => {
    // Verify asset exists and user has access
    const conditions: any[] = [
        eq(assets.id, assetId),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // Filter by user role (CLIENT users can only see their company's assets)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    const asset = await db.query.assets.findFirst({
        where: and(...conditions),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Get overlapping bookings
    const overlappingBookings = await db.query.assetBookings.findMany({
        where: and(
            eq(assetBookings.asset, assetId),
            sql`${assetBookings.blocked_from} <= ${endDate}`,
            sql`${assetBookings.blocked_until} >= ${startDate}`
        ),
        with: {
            order: {
                columns: {
                    id: true,
                    order_id: true,
                },
            },
        },
    });

    const bookedQuantity = overlappingBookings.reduce((sum, booking) => sum + booking.quantity, 0);
    const availableQuantity = Math.max(0, asset.total_quantity - bookedQuantity);

    return {
        total_quantity: asset.total_quantity,
        available_quantity: availableQuantity,
        booked_quantity: bookedQuantity,
        bookings: overlappingBookings.map(b => ({
            order_id: (b.order as any).order_id,
            quantity: b.quantity,
            blocked_from: b.blocked_from,
            blocked_until: b.blocked_until,
        })),
    };
};

// ----------------------------------- HELPER: CHECK MULTIPLE ASSET AVAILABILITY ----------
const checkMultipleAssetsAvailability = async (
    items: Array<{ asset_id: string; quantity: number }>,
    startDate: Date,
    endDate: Date,
    user: AuthUser,
    platformId: string
) => {
    const unavailableItems: Array<{
        asset_id: string;
        asset_name: string;
        requested: number;
        available: number;
        next_available_date?: Date;
    }> = [];

    for (const item of items) {
        const availability = await getSingleAssetAvailability(
            item.asset_id,
            startDate,
            endDate,
            user,
            platformId
        );

        if (availability.available_quantity < item.quantity) {
            // Get asset name
            const asset = await db.query.assets.findFirst({
                where: eq(assets.id, item.asset_id),
                columns: { name: true },
            });

            // Find next available date
            let nextAvailableDate: Date | undefined;
            if (availability.bookings.length > 0) {
                const latestBookingEnd = new Date(
                    Math.max(...availability.bookings.map(b => new Date(b.blocked_until).getTime()))
                );
                nextAvailableDate = new Date(latestBookingEnd);
                nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
            }

            unavailableItems.push({
                asset_id: item.asset_id,
                asset_name: asset?.name || "Unknown",
                requested: item.quantity,
                available: availability.available_quantity,
                next_available_date: nextAvailableDate,
            });
        }
    }

    return {
        all_available: unavailableItems.length === 0,
        unavailable_items: unavailableItems,
    };
};

// ----------------------------------- HELPER: GET ASSET AVAILABILITY SUMMARY -------------
const getAssetAvailabilitySummary = async (
    assetId: string,
    startDate: Date,
    endDate: Date,
    user: AuthUser,
    platformId: string
) => {
    const availability = await getSingleAssetAvailability(assetId, startDate, endDate, user, platformId);

    let message = "";
    let nextAvailableDate: Date | undefined;

    if (availability.available_quantity === 0) {
        // Fully booked - find when it becomes available
        const futureBookings = await db.query.assetBookings.findMany({
            where: and(
                eq(assetBookings.asset, assetId),
                gte(assetBookings.blocked_from, startDate)
            ),
            orderBy: (bookings, { asc }) => [asc(bookings.blocked_until)],
            limit: 1,
        });

        if (futureBookings.length > 0) {
            nextAvailableDate = new Date(futureBookings[0].blocked_until);
            nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
            message = `Fully booked. Available from ${nextAvailableDate.toISOString().split('T')[0]}`;
        } else {
            message = "Currently unavailable";
        }
    } else if (availability.available_quantity < availability.total_quantity) {
        message = `${availability.available_quantity} of ${availability.total_quantity} available`;
    } else {
        message = `All ${availability.total_quantity} units available`;
    }

    return {
        is_available: availability.available_quantity > 0,
        available_quantity: availability.available_quantity,
        total_quantity: availability.total_quantity,
        next_available_date: nextAvailableDate,
        message,
    };
};

// ----------------------------------- HELPER: GENERATE UNIQUE QR CODE --------------------
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

// ----------------------------------- BULK UPLOAD ASSETS -------------------------------------
const bulkUploadAssets = async (file: Express.Multer.File, user: AuthUser, platformId: string): Promise<BulkUploadResponse> => {
    try {
        // Step 1: Parse CSV file
        const parseResult = await parseCSVFile(file);

        if (parseResult.errors.length > 0) {
            return {
                success: false,
                error: 'CSV parsing failed',
                details: {
                    fileErrors: parseResult.errors,
                    rowErrors: [],
                    totalErrors: parseResult.errors.length,
                    totalRows: 0,
                },
            };
        }

        const rows = parseResult.data;

        // Step 2: Validate CSV structure
        const structureValidation = validateCSVStructure(rows);
        if (!structureValidation.valid) {
            return {
                success: false,
                error: 'Invalid CSV structure',
                details: {
                    fileErrors: structureValidation.errors,
                    rowErrors: [],
                    totalErrors: structureValidation.errors.length,
                    totalRows: rows.length,
                },
            };
        }

        // Step 3: Validate all rows
        const validationResult = await validateBulkAssetRows(rows, platformId);

        if (!validationResult.isValid) {
            return {
                success: false,
                error: 'Validation failed',
                details: {
                    fileErrors: validationResult.fileErrors,
                    rowErrors: validationResult.rowErrors,
                    totalErrors: validationResult.totalErrors,
                    totalRows: validationResult.totalRows,
                },
            };
        }

        // Step 4: Create assets in bulk with transaction
        const createdAssets = await createBulkAssets(validationResult.validRows, user);

        // Step 5: Prepare success response
        return {
            success: true,
            data: {
                created: createdAssets.length,
                assets: createdAssets.map((asset) => ({
                    id: asset.id,
                    name: asset.name,
                    qr_code: asset.qr_code,
                })),
            },
        };
    } catch (error) {
        console.error('Error in bulk asset upload:', error);
        throw error;
    }
};

// ----------------------------------- HELPER: PARSE CSV FILE ---------------------------------
const parseCSVFile = async (file: Express.Multer.File): Promise<{
    data: ParsedCSVRow[];
    errors: string[];
}> => {
    return new Promise((resolve) => {
        const fileContent = file.buffer.toString('utf-8');

        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(),
            transform: (value) => value.trim(),
            complete: (results: any) => {
                const errors: string[] = [];

                // Check for parsing errors
                if (results.errors.length > 0) {
                    errors.push(
                        ...results.errors.map((e: any) => `Parse error at row ${e.row}: ${e.message}`)
                    );
                }

                // Add row numbers to data
                const parsedData: ParsedCSVRow[] = (results.data as any[]).map(
                    (row, index) => ({
                        ...row,
                        rowNumber: index + 2, // +2 because index is 0-based and CSV has header row
                    })
                );

                resolve({
                    data: parsedData,
                    errors,
                });
            },
            error: (error: any) => {
                resolve({
                    data: [],
                    errors: [error.message],
                });
            },
        });
    });
};

// ----------------------------------- HELPER: VALIDATE CSV STRUCTURE -------------------------
const validateCSVStructure = (rows: ParsedCSVRow[]): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    const REQUIRED_COLUMNS = [
        'company',
        'warehouse',
        'zone',
        'name',
        'category',
        'trackingMethod',
        'weight',
        'dimensionLength',
        'dimensionWidth',
        'dimensionHeight',
        'volume',
        'totalQuantity',
    ];

    if (rows.length === 0) {
        errors.push('CSV file is empty');
        return { valid: false, errors };
    }

    // Check if first row has all required fields
    const firstRow = rows[0];
    const missingFields: string[] = [];

    REQUIRED_COLUMNS.forEach((col) => {
        if (!(col in firstRow)) {
            missingFields.push(col);
        }
    });

    if (missingFields.length > 0) {
        errors.push(`Missing required columns: ${missingFields.join(', ')}`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
};

// ----------------------------------- HELPER: BUILD FOREIGN KEY CACHE ------------------------
const buildForeignKeyCache = async (rows: ParsedCSVRow[], platformId: string): Promise<ForeignKeyCache> => {
    // Extract unique values
    const companyNames = [...new Set(rows.map(r => r.company).filter(Boolean))];
    const warehouseNames = [...new Set(rows.map(r => r.warehouse).filter(Boolean))];
    const zoneNames = [...new Set(rows.map(r => r.zone).filter(Boolean))];
    const brandNames = [...new Set(rows.map(r => r.brand).filter(Boolean))];

    // Fetch all in parallel
    const [companiesData, warehousesData, zonesData, brandsData] = await Promise.all([
        db.select().from(companies).where(
            and(
                eq(companies.platform_id, platformId),
                isNull(companies.deleted_at),
                inArray(companies.name, companyNames.length > 0 ? companyNames : ['__NONE__'])
            )
        ),
        db.select().from(warehouses).where(
            and(
                eq(warehouses.platform_id, platformId),
                inArray(warehouses.name, warehouseNames.length > 0 ? warehouseNames : ['__NONE__'])
            )
        ),
        db.select().from(zones).where(
            inArray(zones.name, zoneNames.length > 0 ? zoneNames : ['__NONE__'])
        ),
        brandNames.length > 0
            ? db.select().from(brands).where(
                and(
                    eq(brands.platform_id, platformId),
                    eq(brands.is_active, true),
                    inArray(brands.name, brandNames as string[])
                )
            )
            : Promise.resolve([]),
    ]);

    // Build maps
    const cache: ForeignKeyCache = {
        companies: new Map(companiesData.map(c => [c.name, { id: c.id, name: c.name }])),
        warehouses: new Map(warehousesData.map(w => [w.name, { id: w.id, name: w.name }])),
        zones: new Map(zonesData.map(z => [z.name, { id: z.id, name: z.name, warehouse_id: z.warehouse_id, company_id: z.company_id }])),
        brands: new Map(brandsData.map(b => [b.name, { id: b.id, name: b.name, company_id: b.company_id }])),
    };

    return cache;
};

// ----------------------------------- HELPER: VALIDATE BULK ASSET ROWS -----------------------
const validateBulkAssetRows = async (rows: ParsedCSVRow[], platformId: string): Promise<ValidationResult> => {
    const fileErrors: string[] = [];
    const rowErrors: RowValidationError[] = [];

    // Build foreign key cache
    const cache = await buildForeignKeyCache(rows, platformId);

    // Validate each row
    const validatedRows: ValidatedAssetData[] = [];

    for (const row of rows) {
        const errors = validateAssetRow(row, cache, platformId);
        if (errors.length > 0) {
            rowErrors.push({
                row: row.rowNumber,
                errors,
            });
        } else {
            // Transform to validated data
            validatedRows.push(transformCSVRowToAssetData(row, cache, platformId));
        }
    }

    const totalErrors = fileErrors.length + rowErrors.length;
    const isValid = totalErrors === 0;

    return {
        isValid,
        fileErrors,
        rowErrors,
        validRows: isValid ? validatedRows : [],
        totalErrors,
        totalRows: rows.length,
    };
};

// ----------------------------------- HELPER: VALIDATE ASSET ROW ----------------------------
const validateAssetRow = (row: ParsedCSVRow, cache: ForeignKeyCache, platformId: string): string[] => {
    const errors: string[] = [];

    // Validate company
    if (!row.company || row.company.trim() === '') {
        errors.push('Company is required');
    } else if (!cache.companies.has(row.company)) {
        errors.push(`Company "${row.company}" not found`);
    }

    // Validate warehouse
    if (!row.warehouse || row.warehouse.trim() === '') {
        errors.push('Warehouse is required');
    } else if (!cache.warehouses.has(row.warehouse)) {
        errors.push(`Warehouse "${row.warehouse}" not found`);
    }

    // Validate zone
    if (!row.zone || row.zone.trim() === '') {
        errors.push('Zone is required');
    } else if (!cache.zones.has(row.zone)) {
        errors.push(`Zone "${row.zone}" not found`);
    } else {
        // Validate zone belongs to warehouse and company
        const zone = cache.zones.get(row.zone)!;
        const company = cache.companies.get(row.company);
        const warehouse = cache.warehouses.get(row.warehouse);

        if (company && zone.company_id !== company.id) {
            errors.push(`Zone "${row.zone}" does not belong to company "${row.company}"`);
        }
        if (warehouse && zone.warehouse_id !== warehouse.id) {
            errors.push(`Zone "${row.zone}" does not belong to warehouse "${row.warehouse}"`);
        }
    }

    // Validate brand (optional)
    if (row.brand && row.brand.trim() !== '') {
        if (!cache.brands.has(row.brand)) {
            errors.push(`Brand "${row.brand}" not found`);
        } else {
            const brand = cache.brands.get(row.brand)!;
            const company = cache.companies.get(row.company);
            if (company && brand.company_id !== company.id) {
                errors.push(`Brand "${row.brand}" does not belong to company "${row.company}"`);
            }
        }
    }

    // Validate name
    if (!row.name || row.name.trim() === '') {
        errors.push('Name is required');
    } else if (row.name.length > 200) {
        errors.push('Name must be under 200 characters');
    }

    // Validate category
    const validCategories = ['FURNITURE', 'GLASSWARE', 'INSTALLATION', 'DECOR', 'OTHER'];
    if (!row.category || !validCategories.includes(row.category.toUpperCase())) {
        errors.push(`Category must be one of: ${validCategories.join(', ')}`);
    }

    // Validate tracking method
    const validTrackingMethods = ['INDIVIDUAL', 'BATCH'];
    if (!row.trackingMethod || !validTrackingMethods.includes(row.trackingMethod.toUpperCase())) {
        errors.push(`Tracking method must be one of: ${validTrackingMethods.join(', ')}`);
    }

    // Validate numeric fields
    if (!row.weight || isNaN(parseFloat(row.weight)) || parseFloat(row.weight) <= 0) {
        errors.push('Weight must be a positive number');
    }

    if (!row.dimensionLength || isNaN(parseFloat(row.dimensionLength)) || parseFloat(row.dimensionLength) <= 0) {
        errors.push('Dimension length must be a positive number');
    }

    if (!row.dimensionWidth || isNaN(parseFloat(row.dimensionWidth)) || parseFloat(row.dimensionWidth) <= 0) {
        errors.push('Dimension width must be a positive number');
    }

    if (!row.dimensionHeight || isNaN(parseFloat(row.dimensionHeight)) || parseFloat(row.dimensionHeight) <= 0) {
        errors.push('Dimension height must be a positive number');
    }

    if (!row.volume || isNaN(parseFloat(row.volume)) || parseFloat(row.volume) <= 0) {
        errors.push('Volume must be a positive number');
    }

    if (!row.totalQuantity || isNaN(parseInt(row.totalQuantity)) || parseInt(row.totalQuantity) < 1) {
        errors.push('Total quantity must be a positive integer');
    }

    // Validate condition (optional)
    if (row.condition && row.condition.trim() !== '') {
        const validConditions = ['GREEN', 'ORANGE', 'RED'];
        if (!validConditions.includes(row.condition.toUpperCase())) {
            errors.push(`Condition must be one of: ${validConditions.join(', ')}`);
        }
    }

    return errors;
};

// ----------------------------------- HELPER: TRANSFORM CSV ROW TO ASSET DATA ----------------
const transformCSVRowToAssetData = (row: ParsedCSVRow, cache: ForeignKeyCache, platformId: string): ValidatedAssetData => {
    const company = cache.companies.get(row.company)!;
    const warehouse = cache.warehouses.get(row.warehouse)!;
    const zone = cache.zones.get(row.zone)!;
    const brand = row.brand && row.brand.trim() !== '' ? cache.brands.get(row.brand) : undefined;

    // Parse array fields (comma-separated strings)
    const parseArrayField = (field: string | undefined): string[] => {
        if (!field || field.trim() === '') return [];
        return field.split(',').map(item => item.trim()).filter(item => item !== '');
    };

    return {
        platform_id: platformId,
        company_id: company.id,
        warehouse_id: warehouse.id,
        zone_id: zone.id,
        name: row.name.trim(),
        category: row.category.toUpperCase() as any,
        tracking_method: row.trackingMethod.toUpperCase() as 'INDIVIDUAL' | 'BATCH',
        weight_per_unit: parseFloat(row.weight),
        dimensions: {
            length: parseFloat(row.dimensionLength),
            width: parseFloat(row.dimensionWidth),
            height: parseFloat(row.dimensionHeight),
        },
        volume_per_unit: parseFloat(row.volume),
        total_quantity: parseInt(row.totalQuantity),
        packaging: row.packaging && row.packaging.trim() !== '' ? row.packaging.trim() : null,
        brand_id: brand ? brand.id : null,
        description: row.description && row.description.trim() !== '' ? row.description.trim() : null,
        handling_tags: parseArrayField(row.handlingTags),
        images: parseArrayField(row.images),
        condition: row.condition && row.condition.trim() !== ''
            ? (row.condition.toUpperCase() as 'GREEN' | 'ORANGE' | 'RED')
            : 'GREEN',
    };
};

// ----------------------------------- HELPER: CREATE BULK ASSETS -----------------------------
const createBulkAssets = async (validatedRows: ValidatedAssetData[], user: AuthUser): Promise<any[]> => {
    // Use transaction for all-or-nothing guarantee
    return await db.transaction(async (tx) => {
        const allCreatedAssets: any[] = [];

        // Process in batches of 100 for performance
        const batchSize = 100;
        for (let i = 0; i < validatedRows.length; i += batchSize) {
            const batch = validatedRows.slice(i, i + batchSize);

            // Generate QR codes and prepare insert data
            const insertData = await Promise.all(
                batch.map(async (row) => {
                    // Generate unique QR code
                    const baseQRCode = `${row.name.replace(/\s+/g, '-').toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                    const qrCode = await generateUniqueQRCode(baseQRCode, row.platform_id);

                    return {
                        platform_id: row.platform_id,
                        company_id: row.company_id,
                        warehouse_id: row.warehouse_id,
                        zone_id: row.zone_id,
                        brand_id: row.brand_id,
                        name: row.name,
                        description: row.description,
                        category: row.category as 'FURNITURE' | 'GLASSWARE' | 'INSTALLATION' | 'DECOR' | 'OTHER',
                        images: row.images,
                        tracking_method: row.tracking_method,
                        total_quantity: row.total_quantity,
                        available_quantity: row.total_quantity, // Initially all available
                        qr_code: qrCode,
                        packaging: row.packaging,
                        weight_per_unit: row.weight_per_unit.toString(),
                        dimensions: row.dimensions,
                        volume_per_unit: row.volume_per_unit.toString(),
                        condition: row.condition,
                        status: 'AVAILABLE' as const,
                        handling_tags: row.handling_tags,
                    };
                })
            );

            // Insert batch
            const batchAssets = await tx.insert(assets).values(insertData as any).returning();
            allCreatedAssets.push(...batchAssets);
        }

        return allCreatedAssets;
    });
};

export const AssetServices = {
    createAsset,
    getAssets,
    getAssetById,
    updateAsset,
    deleteAsset,
    getAssetAvailabilityStats,
    getAssetScanHistory,
    getBatchAvailability,
    checkAssetAvailability,
    bulkUploadAssets,
};
