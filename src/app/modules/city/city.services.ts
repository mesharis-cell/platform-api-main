import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { cities, countries } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { cityQueryValidationConfig, citySortableFields } from "./city.utils";
import { CityPayload } from "./city.interfaces";

// ----------------------------------- CREATE CITY -----------------------------------
const createCity = async (data: CityPayload) => {
    try {
        // Step 1: Validate country exists
        const [country] = await db
            .select()
            .from(countries)
            .where(
                and(eq(countries.id, data.country_id), eq(countries.platform_id, data.platform_id))
            );

        if (!country) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Country not found");
        }

        // Step 2: Insert city into database
        const [result] = await db.insert(cities).values(data).returning();
        return result;
    } catch (error: any) {
        // Step 3: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "cities_platform_country_name_unique") {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `City with name "${data.name}" already exists for this country`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A city with these details already exists"
            );
        }

        throw error;
    }
};

// ----------------------------------- GET CITIES -------------------------------------
const getCities = async (platformId: string, query: Record<string, any>) => {
    const { search_term, page, limit, sort_by, sort_order, country_id } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(cityQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(cityQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(cities.platform_id, platformId)];

    // Step 3a: Search by city name
    if (search_term) {
        const searchConditions = [ilike(cities.name, `%${search_term.trim()}%`)];
        conditions.push(...searchConditions);
    }

    // Step 3b: Filter by country
    if (country_id) {
        conditions.push(eq(cities.country_id, country_id));
    }

    // Step 4: Determine sort order
    const orderByColumn = citySortableFields[sortWith] || cities.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db.query.cities.findMany({
            where: and(...conditions),
            with: {
                country: {
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
            .from(cities)
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

// ----------------------------------- GET CITY BY ID --------------------------------
const getCityById = async (id: string, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [eq(cities.id, id), eq(cities.platform_id, platformId)];

    // Step 2: Fetch city with country information
    const city = await db.query.cities.findFirst({
        where: and(...conditions),
        with: {
            country: {
                columns: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    // Step 3: Handle not found
    if (!city) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "City not found");
    }

    return city;
};

// ----------------------------------- UPDATE CITY -----------------------------------
const updateCity = async (id: string, platformId: string, data: CityPayload) => {
    try {
        // Step 1: Verify city exists
        const conditions: any[] = [eq(cities.id, id), eq(cities.platform_id, platformId)];

        const [existingCity] = await db
            .select()
            .from(cities)
            .where(and(...conditions));

        if (!existingCity) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "City not found");
        }

        // Step 2: Validate country exists if country_id is being updated
        if (data.country_id) {
            const [country] = await db
                .select()
                .from(countries)
                .where(
                    and(eq(countries.id, data.country_id), eq(countries.platform_id, platformId))
                );

            if (!country) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Country not found");
            }
        }

        // Step 3: Update city
        const [result] = await db
            .update(cities)
            .set({
                ...data,
            })
            .where(eq(cities.id, id))
            .returning();

        return result;
    } catch (error: any) {
        // Step 4: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "cities_platform_country_name_unique") {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `City with name "${data.name}" already exists for this country`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A city with these details already exists"
            );
        }

        throw error;
    }
};

// ----------------------------------- DELETE CITY -----------------------------------
const deleteCity = async (id: string, platformId: string) => {
    // Step 1: Verify city exists
    const conditions: any[] = [eq(cities.id, id), eq(cities.platform_id, platformId)];

    const [existingCity] = await db
        .select()
        .from(cities)
        .where(and(...conditions));

    if (!existingCity) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "City not found");
    }

    // Step 2: Delete city
    await db.delete(cities).where(eq(cities.id, id));

    return null;
};

export const CityServices = {
    createCity,
    getCities,
    getCityById,
    updateCity,
    deleteCity,
};
