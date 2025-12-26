import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, warehouses, zones } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateZonePayload } from "./zone.interfaces";
import { zoneQueryValidationConfig, zoneSortableFields } from "./zone.utils";

// ----------------------------------- CREATE ZONE -----------------------------------
const createZone = async (data: CreateZonePayload) => {
    try {
        // Step 1: Validate warehouse exists and is active
        const [warehouse] = await db
            .select()
            .from(warehouses)
            .where(
                and(
                    eq(warehouses.id, data.warehouse_id),
                    eq(warehouses.platform_id, data.platform_id),
                    eq(warehouses.is_active, true)
                )
            );

        if (!warehouse) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found or is inactive");
        }

        // Step 2: Validate company exists and is not archived
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

        // Step 3: Insert zone into database
        const [result] = await db.insert(zones).values(data).returning();
        return result;
    } catch (error: any) {
        // Step 4: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === '23505') {
            if (pgError.constraint === 'zones_warehouse_company_name_unique') {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Zone with name "${data.name}" already exists for this warehouse and company`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                'A zone with these details already exists'
            );
        }

        throw error;
    }
};

// ----------------------------------- GET ZONES -------------------------------------
const getZones = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        warehouse_id,
        company_id,
        include_inactive
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(zoneQueryValidationConfig, "sort_by", sort_by);
    if (sort_order)
        queryValidator(zoneQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
        paginationMaker({
            page,
            limit,
            sort_by,
            sort_order,
        });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(zones.platform_id, platformId)];

    // Step 3a: Filter by user role (CLIENT users see only their company's zones)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(zones.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3b: Search by zone name
    if (search_term) {
        conditions.push(
            ilike(zones.name, `%${search_term.trim()}%`)
        );
    }

    // Step 3c: Filter by warehouse ID
    if (warehouse_id) {
        conditions.push(eq(zones.warehouse_id, warehouse_id));
    }

    // Step 3d: Filter by company ID
    if (company_id) {
        conditions.push(eq(zones.company_id, company_id));
    }

    // Step 3e: Filter by active status (default: only active zones)
    if (include_inactive !== 'true') {
        conditions.push(eq(zones.is_active, true));
    }

    // Step 4: Determine sort order
    const orderByColumn = zoneSortableFields[sortWith] || zones.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db.query.zones.findMany({
            where: and(...conditions),
            with: {
                warehouse: {
                    columns: {
                        id: true,
                        name: true,
                        country: true,
                        city: true,
                        address: true
                    },
                },
                company: {
                    columns: {
                        id: true,
                        name: true,
                        domain: true,
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
            .from(zones)
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

// ----------------------------------- GET ZONE BY ID --------------------------------
const getZoneById = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [
        eq(zones.id, id),
        eq(zones.platform_id, platformId),
    ];

    // Step 2: Filter by user role (CLIENT users can only see their company's zones)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(zones.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3: Fetch zone with warehouse and company information
    const zone = await db.query.zones.findFirst({
        where: and(...conditions),
        with: {
            warehouse: {
                columns: {
                    id: true,
                    name: true,
                    country: true,
                    city: true,
                    address: true,
                },
            },
            company: {
                columns: {
                    id: true,
                    name: true,
                    domain: true,
                },
            },
        },
    });

    // Step 4: Handle not found
    if (!zone) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Zone not found");
    }

    return zone;
};

// ----------------------------------- UPDATE ZONE -----------------------------------
const updateZone = async (id: string, data: any, user: AuthUser, platformId: string) => {
    try {
        // Step 1: Verify zone exists and user has access
        const conditions: any[] = [
            eq(zones.id, id),
            eq(zones.platform_id, platformId),
        ];

        // CLIENT users can only update their company's zones
        if (user.role === 'CLIENT') {
            if (user.company_id) {
                conditions.push(eq(zones.company_id, user.company_id));
            } else {
                throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
            }
        }

        const [existingZone] = await db
            .select()
            .from(zones)
            .where(and(...conditions));

        if (!existingZone) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Zone not found");
        }

        // Step 2: If warehouse_id is being updated, validate it exists and is active
        if (data.warehouse_id) {
            const [warehouse] = await db
                .select()
                .from(warehouses)
                .where(
                    and(
                        eq(warehouses.id, data.warehouse_id),
                        eq(warehouses.platform_id, platformId),
                        eq(warehouses.is_active, true)
                    )
                );

            if (!warehouse) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found or is inactive");
            }
        }

        // Step 3: If company_id is being updated, validate it exists
        if (data.company_id) {
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

        // Step 4: Update zone
        const [result] = await db
            .update(zones)
            .set({
                ...data,
            })
            .where(eq(zones.id, id))
            .returning();

        return result;
    } catch (error: any) {
        // Step 5: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === '23505') {
            if (pgError.constraint === 'zones_warehouse_company_name_unique') {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Zone with name "${data.name}" already exists for this warehouse and company`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                'A zone with these details already exists'
            );
        }

        throw error;
    }
};

// ----------------------------------- DELETE ZONE -----------------------------------
const deleteZone = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Verify zone exists and user has access
    const conditions: any[] = [
        eq(zones.id, id),
        eq(zones.platform_id, platformId),
    ];

    const [existingZone] = await db
        .select()
        .from(zones)
        .where(and(...conditions));

    if (!existingZone) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Zone not found");
    }

    // Step 2: Mark zone as inactive (soft delete)
    await db
        .update(zones)
        .set({
            is_active: existingZone.is_active ? false : true,
        })
        .where(eq(zones.id, id))
        .returning();

    return null;
};

export const ZoneServices = {
    createZone,
    getZones,
    getZoneById,
    updateZone,
    deleteZone,
};
