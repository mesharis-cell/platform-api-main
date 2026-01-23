import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { warehouses } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateWarehousePayload } from "./warehouse.interfaces";
import { warehouseQueryValidationConfig, warehouseSortableFields } from "./warehouse.utils";

// ----------------------------------- CREATE WAREHOUSE -----------------------------------
const createWarehouse = async (data: CreateWarehousePayload) => {
    try {
        // Step 1: Insert warehouse into database
        const [result] = await db.insert(warehouses).values(data).returning();
        return result;
    } catch (error: any) {
        // Step 2: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "warehouses_platform_name_unique") {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Warehouse with name "${data.name}" already exists for this platform`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A warehouse with these details already exists"
            );
        }

        throw error;
    }
};

// ----------------------------------- GET WAREHOUSES -------------------------------------
const getWarehouses = async (query: Record<string, any>, platformId: string) => {
    const { search_term, page, limit, sort_by, sort_order, country, city, include_inactive } =
        query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(warehouseQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(warehouseQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(warehouses.platform_id, platformId)];

    // Step 3a: Search by warehouse name, country, or city
    if (search_term) {
        conditions.push(
            or(
                ilike(warehouses.name, `%${search_term.trim()}%`),
                ilike(warehouses.country, `%${search_term.trim()}%`),
                ilike(warehouses.city, `%${search_term.trim()}%`)
            )
        );
    }

    // Step 3b: Filter by country
    if (country) {
        conditions.push(ilike(warehouses.country, `%${country.trim()}%`));
    }

    // Step 3c: Filter by city
    if (city) {
        conditions.push(ilike(warehouses.city, `%${city.trim()}%`));
    }

    // Step 3d: Filter by active status (default: only active warehouses)
    if (include_inactive !== "true") {
        conditions.push(eq(warehouses.is_active, true));
    }

    // Step 4: Determine sort order
    const orderByColumn = warehouseSortableFields[sortWith] || warehouses.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db.query.warehouses.findMany({
            where: and(...conditions),
            orderBy: orderDirection,
            limit: limitNumber,
            offset: skip,
        }),

        db
            .select({
                count: count(),
            })
            .from(warehouses)
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

// ----------------------------------- GET WAREHOUSE BY ID --------------------------------
const getWarehouseById = async (id: string, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [eq(warehouses.id, id), eq(warehouses.platform_id, platformId)];

    // Step 2: Fetch warehouse
    const warehouse = await db.query.warehouses.findFirst({
        where: and(...conditions),
    });

    // Step 3: Handle not found
    if (!warehouse) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
    }

    return warehouse;
};

// ----------------------------------- UPDATE WAREHOUSE -----------------------------------
const updateWarehouse = async (id: string, data: any, platformId: string) => {
    try {
        // Step 1: Verify warehouse exists
        const conditions: any[] = [eq(warehouses.id, id), eq(warehouses.platform_id, platformId)];

        const [existingWarehouse] = await db
            .select()
            .from(warehouses)
            .where(and(...conditions));

        if (!existingWarehouse) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
        }

        // Step 2: Update warehouse
        const [result] = await db
            .update(warehouses)
            .set({
                ...data,
            })
            .where(eq(warehouses.id, id))
            .returning();

        return result;
    } catch (error: any) {
        // Step 3: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "warehouses_platform_name_unique") {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Warehouse with name "${data.name}" already exists for this platform`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A warehouse with these details already exists"
            );
        }

        throw error;
    }
};

// ----------------------------------- DELETE WAREHOUSE -----------------------------------
const deleteWarehouse = async (id: string, platformId: string) => {
    // Step 1: Verify warehouse exists
    const conditions: any[] = [eq(warehouses.id, id), eq(warehouses.platform_id, platformId)];

    const [existingWarehouse] = await db
        .select()
        .from(warehouses)
        .where(and(...conditions));

    if (!existingWarehouse) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
    }

    // Step 2: Mark warehouse as active/inactive
    await db
        .update(warehouses)
        .set({
            is_active: existingWarehouse.is_active ? false : true,
        })
        .where(eq(warehouses.id, id))
        .returning();

    return null;
};

export const WarehouseServices = {
    createWarehouse,
    getWarehouses,
    getWarehouseById,
    updateWarehouse,
    deleteWarehouse,
};
