import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, sql } from "drizzle-orm";
import httpStatus from "http-status";
import QRCode from "qrcode";
import { db } from "../../../db";
import {
    assetBookings,
    assets,
    brands,
    companies,
    orders,
    scanEvents,
    warehouses,
    zones,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { CSVFileParser, CSVStructureValidator } from "../../utils/csv-utility";
import paginationMaker from "../../utils/pagination-maker";
import { qrCodeGenerator } from "../../utils/qr-code-generator";
import queryValidator from "../../utils/query-validator";
import {
    AddConditionHistoryPayload,
    CompleteMaintenancePayload,
    CreateAssetPayload,
    GenerateQRCodePayload,
    SingleAssetAvailabilityResponse,
    UnavailableItem,
} from "./assets.interfaces";
import {
    ASSET_ALL_COLUMNS,
    ASSET_REQUIRED_COLUMNS,
    assetQueryValidationConfig,
    assetSortableFields,
} from "./assets.utils";
import { RowValidationResult, validateReferences } from "./assets.validators";

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
                .where(and(eq(zones.id, data.zone_id), eq(zones.warehouse_id, data.warehouse_id))),
        ]);

        if (!company) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
        }

        if (!warehouse) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
        }

        if (!zone) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Zone not found or does not belong to the specified warehouse and company"
            );
        }

        // Step 2: Validate brand if provided
        if (data.brand_id) {
            const [brand] = await db
                .select()
                .from(brands)
                .where(and(eq(brands.id, data.brand_id), eq(brands.company_id, data.company_id)));

            if (!brand) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Brand not found or does not belong to the specified company"
                );
            }
        }

        // Step 3: Handle INDIVIDUAL tracking with quantity > 1 - Create N separate assets
        if (data.tracking_method === "INDIVIDUAL" && data.total_quantity > 1) {
            const createdAssets: any[] = [];

            for (let i = 0; i < data.total_quantity; i++) {
                // Generate unique QR code for each unit
                const qrCode = await qrCodeGenerator(data.company_id);

                // Create initial condition history entry
                const initialConditionHistory = [];
                if (data.condition_notes || (data.condition && data.condition !== "GREEN")) {
                    initialConditionHistory.push({
                        condition: data.condition || "GREEN",
                        notes: data.condition_notes || "Initial condition",
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
                        tracking_method: "INDIVIDUAL",
                        total_quantity: 1, // Each individual unit has quantity 1
                        available_quantity: 1,
                        qr_code: qrCode,
                        packaging: null, // Individual items don't have packaging
                        weight_per_unit: data.weight_per_unit.toString(),
                        dimensions: data.dimensions || {},
                        volume_per_unit: data.volume_per_unit.toString(),
                        condition: data.condition || "GREEN",
                        condition_notes: data.condition_notes || null,
                        refurb_days_estimate: data.refurb_days_estimate || null,
                        condition_history: initialConditionHistory,
                        handling_tags: data.handling_tags || [],
                        status: data.status || "AVAILABLE",
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
        const qrCode = await qrCodeGenerator(data.company_id);

        // Create initial condition history entry
        const initialConditionHistory = [];
        if (data.condition_notes || (data.condition && data.condition !== "GREEN")) {
            initialConditionHistory.push({
                condition: data.condition || "GREEN",
                notes: data.condition_notes || "Initial condition",
                updated_by: user.email,
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
            condition: data.condition || "GREEN",
            condition_notes: data.condition_notes || null,
            refurb_days_estimate: data.refurb_days_estimate || null,
            condition_history: initialConditionHistory,
            handling_tags: data.handling_tags || [],
            status: data.status || "AVAILABLE",
        };

        const [result] = await db.insert(assets).values(dbData).returning();
        return result;
    } catch (error: any) {
        // Step 5: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "assets_qr_code_key") {
                throw new CustomizedError(httpStatus.CONFLICT, `Duplicate QR code found`);
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "An asset with these details already exists"
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
    if (user.role === "CLIENT") {
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

    // Step 3i: Filter by condition (supports multiple values: GREEN,ORANGE,RED)
    if (condition) {
        // Check if condition contains comma (multiple values)
        if (condition.includes(",")) {
            // Split by comma and trim whitespace
            const conditionArray = condition.split(",").map((c: string) => c.trim());
            conditions.push(inArray(assets.condition, conditionArray));
        } else {
            // Single condition value
            conditions.push(eq(assets.condition, condition));
        }
    }

    // Step 3j: Filter by status
    if (status) {
        conditions.push(eq(assets.status, status));
    }

    // Step 3k: Filter by deleted status (default: only active assets)
    if (include_inactive !== "true") {
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

    // Get summary counts
    const [redCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(
            and(
                eq(assets.platform_id, platformId),
                eq(assets.condition, "RED"),
                isNull(assets.deleted_at)
            )
        );

    const [orangeCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(
            and(
                eq(assets.platform_id, platformId),
                eq(assets.condition, "ORANGE"),
                isNull(assets.deleted_at)
            )
        );

    // Step 6: Return paginated response
    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
            summary: {
                red_count: redCount.count,
                orange_count: orangeCount.count,
            },
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
    if (user.role === "CLIENT") {
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
    if (
        asset.condition_history &&
        Array.isArray(asset.condition_history) &&
        asset.condition_history.length > 0
    ) {
        // Sort condition_history by timestamp desc to get the most recent entry first
        const sortedHistory = [...asset.condition_history].sort((a: any, b: any) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeB - timeA;
        });

        const latestHistory = sortedHistory[0];
        if (latestHistory && typeof latestHistory === "object" && "notes" in latestHistory) {
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
        brand_details: asset.brand
            ? {
                id: asset.brand.id,
                name: asset.brand.name,
                logo_url: asset.brand.logo_url,
            }
            : null,
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
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Zone not found or does not belong to the specified warehouse and company"
                );
            }
        }

        // Step 5: Validate brand if being updated
        if (data.brand_id && existingAsset.brand_id !== data.brand_id) {
            const targetCompanyId = data.company_id || existingAsset.company_id;

            const [brand] = await db
                .select()
                .from(brands)
                .where(and(eq(brands.id, data.brand_id), eq(brands.company_id, targetCompanyId)));

            if (!brand) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Brand not found or does not belong to the specified company"
                );
            }
        }

        // Step 6: Validate quantity constraints if either is being updated
        if (data.total_quantity !== undefined || data.available_quantity !== undefined) {
            const finalTotalQty =
                data.total_quantity !== undefined
                    ? data.total_quantity
                    : parseInt(existingAsset.total_quantity.toString());
            const finalAvailableQty =
                data.available_quantity !== undefined
                    ? data.available_quantity
                    : parseInt(existingAsset.available_quantity.toString());

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
            if (data.condition === "GREEN") {
                dbData.refurb_days_estimate = null;
            }

            // Add condition change to history
            const existingHistory = Array.isArray(existingAsset.condition_history)
                ? existingAsset.condition_history
                : [];

            const newHistoryEntry = {
                condition: data.condition,
                notes: data.condition_notes || null,
                photos: [],
                updated_by: user.email,
                timestamp: new Date().toISOString(),
            };

            dbData.condition_history = [newHistoryEntry, ...existingHistory];
        }

        // Step 9: Update asset
        const [result] = await db.update(assets).set(dbData).where(eq(assets.id, id)).returning();

        return result;
    } catch (error: any) {
        // Step 10: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "assets_qr_code_key") {
                throw new CustomizedError(httpStatus.CONFLICT, `Duplicate QR code found`);
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "An asset with these details already exists"
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
    });

    if (bookings) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "Cannot delete asset that has active bookings"
        );
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
    if (user.role === "CLIENT") {
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
        .innerJoin(orders, eq(assetBookings.order_id, orders.id))
        .where(
            and(
                eq(assetBookings.asset_id, id),
                inArray(orders.order_status, [
                    "CONFIRMED",
                    "IN_PREPARATION",
                    "READY_FOR_DELIVERY",
                    "IN_TRANSIT",
                    "DELIVERED",
                    "IN_USE",
                    "AWAITING_RETURN",
                ])
            )
        );

    const bookedQuantity = activeBookings.reduce((sum, booking) => sum + booking.quantity, 0);

    // Step 3: Calculate OUT quantity from scan events
    const outboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(and(eq(scanEvents.asset_id, id), eq(scanEvents.scan_type, "OUTBOUND")));

    const inboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(and(eq(scanEvents.asset_id, id), eq(scanEvents.scan_type, "INBOUND")));

    const totalOutbound = outboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const totalInbound = inboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const outQuantity = Math.max(0, totalOutbound - totalInbound);

    // Step 4: Calculate IN_MAINTENANCE quantity
    let inMaintenanceQuantity = 0;
    if (asset.condition === "RED") {
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
    if (user.role === "CLIENT") {
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
                },
            },
            scanned_by_user: {
                columns: {
                    id: true,
                    name: true,
                },
            },
            order: {
                columns: {
                    id: true,
                    order_id: true,
                },
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
    if (user.role === "CLIENT") {
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
            available_quantity: assets.available_quantity,
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
                const summary = await getAssetAvailabilitySummary(
                    id,
                    startDate,
                    endDate,
                    user,
                    platformId
                );
                return {
                    asset_id: id,
                    ...summary,
                };
            })
        );
        return { assets: summaries };
    }

    throw new CustomizedError(
        httpStatus.BAD_REQUEST,
        "Either asset_id, asset_ids, or items array is required"
    );
};

// ----------------------------------- HELPER: GET SINGLE ASSET AVAILABILITY --------------
const getSingleAssetAvailability = async (
    assetId: string,
    startDate: Date,
    endDate: Date,
    user: AuthUser,
    platformId: string
): Promise<SingleAssetAvailabilityResponse> => {
    // Verify asset exists and user has access
    const conditions: any[] = [
        eq(assets.id, assetId),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // Filter by user role (CLIENT users can only see their company's assets)
    if (user.role === "CLIENT") {
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
            eq(assetBookings.asset_id, assetId),
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
        asset_name: asset.name,
        total_quantity: asset.total_quantity,
        available_quantity: availableQuantity,
        booked_quantity: bookedQuantity,
        bookings: overlappingBookings.map((b) => ({
            order_id: (b.order as any).order_id,
            quantity: b.quantity,
            blocked_from: b.blocked_from,
            blocked_until: b.blocked_until,
        })),
    };
};

// ----------------------------------- HELPER: CHECK MULTIPLE ASSET AVAILABILITY ----------
export const checkMultipleAssetsAvailability = async (
    items: Array<{ asset_id: string; quantity: number }>,
    startDate: Date,
    endDate: Date,
    user: AuthUser,
    platformId: string
): Promise<{ all_available: boolean; unavailable_items: Array<UnavailableItem> }> => {
    const unavailableItems: Array<UnavailableItem> = [];

    for (const item of items) {
        const availability = await getSingleAssetAvailability(
            item.asset_id,
            startDate,
            endDate,
            user,
            platformId
        );

        if (availability.available_quantity < item.quantity) {
            // Find next available date
            let nextAvailableDate: Date | undefined;
            if (availability.bookings.length > 0) {
                const latestBookingEnd = new Date(
                    Math.max(
                        ...availability.bookings.map((b) => new Date(b.blocked_until).getTime())
                    )
                );
                nextAvailableDate = new Date(latestBookingEnd);
                nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
            }

            unavailableItems.push({
                asset_id: item.asset_id,
                asset_name: availability.asset_name,
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
export const getAssetAvailabilitySummary = async (
    assetId: string,
    startDate: Date,
    endDate: Date,
    user: AuthUser,
    platformId: string
) => {
    const availability = await getSingleAssetAvailability(
        assetId,
        startDate,
        endDate,
        user,
        platformId
    );

    let message = "";
    let nextAvailableDate: Date | undefined;

    if (availability.available_quantity === 0) {
        // Fully booked - find when it becomes available
        const futureBookings = await db.query.assetBookings.findMany({
            where: and(
                eq(assetBookings.asset_id, assetId),
                gte(assetBookings.blocked_from, startDate)
            ),
            orderBy: (bookings, { asc }) => [asc(bookings.blocked_until)],
            limit: 1,
        });

        if (futureBookings.length > 0) {
            nextAvailableDate = new Date(futureBookings[0].blocked_until);
            nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
            message = `Fully booked. Available from ${nextAvailableDate.toISOString().split("T")[0]}`;
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

// ----------------------------------- BULK UPLOAD ASSETS ---------------------------------
const bulkUploadAssets = async (file: Express.Multer.File, user: AuthUser, platformId: string) => {
    // Step 1: Parse CSV file
    const parseResult = await CSVFileParser(file);

    if (parseResult.errors.length > 0) {
        throw new CustomizedError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to parse CSV file");
    }

    const rows = parseResult.data;

    // Step 2: Validate CSV structure
    const { errors, valid_rows } = CSVStructureValidator(
        rows,
        ASSET_ALL_COLUMNS,
        ASSET_REQUIRED_COLUMNS
    );

    if (errors.length > 0) {
        return {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Invalid CSV structure",
            data: errors,
        };
    }

    // Step 3: Validate reference IDs for each row
    const validationErrors: RowValidationResult[] = [];

    for (const row of valid_rows) {
        const rowErrors = await validateReferences(row, platformId);

        if (rowErrors.length > 0) {
            validationErrors.push({
                rowNumber: row.rowNumber,
                name: row.name || "Unknown",
                errors: rowErrors,
            });
        }
    }

    // If any validation errors, return them
    if (validationErrors.length > 0) {
        return {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Reference validation failed",
            data: validationErrors,
        };
    }

    // Step 4: Transform and prepare data for insertion
    const assetsToInsert = await Promise.all(valid_rows.map(async (row) => {
        // Remove rowNumber and any other non-schema fields
        const { rowNumber, ...assetData } = row;

        // Helper function to parse JSON strings or return default
        const parseJsonField = (field: any, defaultValue: any) => {
            if (!field || field === "") return defaultValue;
            if (typeof field === "string") {
                try {
                    return JSON.parse(field);
                } catch {
                    return defaultValue;
                }
            }
            return field;
        };

        // Helper function to handle empty strings for optional fields
        const handleOptionalField = (field: any) => {
            return field === "" || field === null || field === undefined ? undefined : field;
        };

        const qrCode = await qrCodeGenerator(assetData.company_id);

        // Parse JSON fields
        assetData.qr_code = qrCode;
        assetData.images = parseJsonField(assetData.images, []);
        assetData.dimensions = parseJsonField(assetData.dimensions, {});
        assetData.handling_tags = parseJsonField(assetData.handling_tags, []);
        assetData.condition_history = parseJsonField(assetData.condition_history, []);

        // Convert numeric fields from strings to numbers
        if (assetData.total_quantity) {
            assetData.total_quantity = parseInt(assetData.total_quantity.toString());
        }
        if (assetData.available_quantity) {
            assetData.available_quantity = parseInt(assetData.available_quantity.toString());
        }

        // Handle decimal fields (keep as strings for Drizzle)
        if (assetData.weight_per_unit) {
            assetData.weight_per_unit = assetData.weight_per_unit.toString();
        }
        if (assetData.volume_per_unit) {
            assetData.volume_per_unit = assetData.volume_per_unit.toString();
        }

        // Handle optional numeric fields
        assetData.refurb_days_estimate =
            assetData.refurb_days_estimate && assetData.refurb_days_estimate !== ""
                ? parseInt(assetData.refurb_days_estimate.toString())
                : undefined;

        // Handle optional string fields (convert empty strings to undefined)
        assetData.brand_id = handleOptionalField(assetData.brand_id);
        assetData.description = handleOptionalField(assetData.description);
        assetData.packaging = handleOptionalField(assetData.packaging);
        assetData.condition_notes = handleOptionalField(assetData.condition_notes);

        // Handle optional timestamp fields
        assetData.last_scanned_at = handleOptionalField(assetData.last_scanned_at);
        assetData.last_scanned_by = handleOptionalField(assetData.last_scanned_by);
        assetData.deleted_at = handleOptionalField(assetData.deleted_at);

        // Remove timestamp fields that should be auto-generated
        delete assetData.created_at;
        delete assetData.updated_at;
        delete assetData.id;

        // Ensure platform_id is set
        assetData.platform_id = platformId;

        return assetData;
    }));

    // Step 5: Insert assets into database
    const insertedAssets = (await db
        .insert(assets)
        .values(assetsToInsert as any)
        .returning()) as Array<typeof assets.$inferSelect>;

    return {
        statusCode: httpStatus.CREATED,
        success: true,
        message: `${insertedAssets.length} asset(s) uploaded successfully`,
        data: insertedAssets,
    };
};

// ----------------------------------- ADD CONDITION HISTORY ------------------------------
const addConditionHistory = async (
    data: AddConditionHistoryPayload,
    user: AuthUser,
    platformId: string
) => {
    // Step 1: Fetch asset (verify exists, platform scope, not deleted)
    const asset = await db.query.assets.findFirst({
        where: and(
            eq(assets.id, data.asset_id),
            eq(assets.platform_id, platformId),
            isNull(assets.deleted_at)
        ),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Validate notes requirement
    if (
        data.condition &&
        (data.condition === "ORANGE" || data.condition === "RED") &&
        !data.notes
    ) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Notes are required when marking items as Orange or Red"
        );
    }

    // Validate photos requirement
    if (data.condition && data.condition === "RED" && (!data.photos || data.photos.length === 0)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least one damage photo is required when marking items as Red"
        );
    }

    // Step 2: Get existing history or initialize empty array
    const existingHistory = Array.isArray(asset.condition_history) ? asset.condition_history : [];

    // Step 3: Create new history entry
    const newHistory = {
        condition: data.condition || asset.condition,
        notes: data.notes || "",
        photos: data.photos || [],
        updated_by: user.id,
        timestamp: new Date().toISOString(),
    };

    // Step 4: Prepend new entry (newest first)
    const condition_history = [newHistory, ...existingHistory];

    // Step 5: Prepare update data with conditional refurb_days_estimate
    const updatedData: {
        condition_history: any[];
        condition: string;
        refurb_days_estimate?: number | null;
    } = {
        condition_history,
        condition: data.condition || asset.condition,
    };

    if (data.condition && data.condition === "GREEN") {
        updatedData.refurb_days_estimate = null;
    } else if (data.refurb_days_estimate) {
        updatedData.refurb_days_estimate = data.refurb_days_estimate;
    }

    // Step 6: Update asset with new history
    const [result] = await db
        .update(assets)
        .set(updatedData as any)
        .where(eq(assets.id, data.asset_id))
        .returning({
            id: assets.id,
            name: assets.name,
            condition: assets.condition,
            condition_history: assets.condition_history,
        });

    return result;
};

// ----------------------------------- GENERATE QR CODE -----------------------------------
const generateQRCode = async (data: GenerateQRCodePayload) => {
    // Generate QR code as base64 PNG
    const qrCodeImage = await QRCode.toDataURL(data.qr_code, {
        errorCorrectionLevel: "H",
        type: "image/png",
        width: 300,
        margin: 2,
    });

    return {
        qr_code_image: qrCodeImage,
    };
};

// ----------------------------------- COMPLETE MAINTENANCE -------------------------------
// const completeMaintenance = async (
//     data: CompleteMaintenancePayload,
//     user: AuthUser,
//     platformId: string
// ) => {
//     // Step 1: Fetch asset to verify it exists and is in RED condition
//     const asset = await db.query.assets.findFirst({
//         where: and(
//             eq(assets.id, data.asset_id),
//             eq(assets.platform_id, platformId),
//             isNull(assets.deleted_at)
//         ),
//     });

//     if (!asset) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
//     }

//     // Step 2: Validate asset is in RED condition
//     if (asset.condition !== "RED") {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Only RED condition assets can have maintenance completed"
//         );
//     }

//     // Step 3: Get existing history or initialize empty array
//     const existingHistory = Array.isArray(asset.condition_history) ? asset.condition_history : [];

//     // Step 4: Create new history entry for maintenance completion
//     const newHistory = {
//         condition: "GREEN" as const,
//         notes: data.maintenance_notes,
//         photos: [],
//         updated_by: user.id,
//         timestamp: new Date().toISOString(),
//     };

//     // Step 5: Prepend new entry (newest first)
//     const condition_history = [newHistory, ...existingHistory];

//     // Step 6: Update asset - set to GREEN and AVAILABLE
//     const [result] = await db
//         .update(assets)
//         .set({
//             condition: "GREEN",
//             status: "AVAILABLE",
//             condition_history,
//         })
//         .where(eq(assets.id, data.asset_id))
//         .returning({
//             id: assets.id,
//             name: assets.name,
//             condition: assets.condition,
//             status: assets.status,
//             condition_history: assets.condition_history,
//             updated_at: assets.updated_at,
//         });

//     return result;
// };

const sentAssetToMaintenance = async (
    assetId: string,
    platformId: string,
) => {
    // Step 1: Fetch order and verify status
    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.id, assetId), eq(assets.platform_id, platformId)),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    if (asset.status === "MAINTENANCE") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset is already in maintenance");
    }

    if (asset.status !== "BOOKED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset is not in booked status");
    }

    await db.transaction(async (tx) => {
        await tx
            .update(assets)
            .set({
                status: "MAINTENANCE",
                updated_at: new Date(),
            })
            .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)));
    });

    return {
        asset_id: assetId,
        status: "MAINTENANCE",
    };
}

const completeAssetMaintenance = async (
    assetId: string,
    platformId: string,
) => {
    // Step 1: Fetch order and verify status
    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.id, assetId), eq(assets.platform_id, platformId)),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    if (asset.status !== "MAINTENANCE") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset is not in maintenance status");
    }

    await db.transaction(async (tx) => {
        await tx
            .update(assets)
            .set({
                status: "BOOKED",
                condition: "GREEN",
                updated_at: new Date(),
            })
            .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)));
    });

    return {
        asset_id: assetId,
        status: "BOOKED",
    };
}

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
    getSingleAssetAvailability,
    bulkUploadAssets,
    addConditionHistory,
    generateQRCode,
    // completeMaintenance,
    sentAssetToMaintenance,
    completeAssetMaintenance
};
