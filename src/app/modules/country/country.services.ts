import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { countries } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { countryQueryValidationConfig, countrySortableFields } from "./country.utils";
import { CountryPayload } from "./country.interfaces";

// ----------------------------------- CREATE COUNTRY -----------------------------------
const createCountry = async (data: CountryPayload) => {
    try {
        // Step 1: Insert country into database
        const [result] = await db.insert(countries).values(data).returning();
        return result;
    } catch (error: any) {
        // Step 2: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "countries_platform_name_unique") {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Country with name "${data.name}" already exists for this platform`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A country with these details already exists"
            );
        }

        throw error;
    }
};

// ----------------------------------- GET COUNTRIES -------------------------------------
const getCountries = async (platformId: string, query: Record<string, any>) => {
    const { search_term, page, limit, sort_by, sort_order } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(countryQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(countryQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(countries.platform_id, platformId)];

    // Step 3a: Search by country name or code
    if (search_term) {
        const searchConditions = [ilike(countries.name, `%${search_term.trim()}%`)];
        conditions.push(...searchConditions);
    }

    // Step 4: Determine sort order
    const orderByColumn = countrySortableFields[sortWith] || countries.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db.query.countries.findMany({
            where: and(...conditions),
            orderBy: orderDirection,
            limit: limitNumber,
            offset: skip,
        }),

        db
            .select({
                count: count(),
            })
            .from(countries)
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

// ----------------------------------- GET COUNTRY BY ID --------------------------------
const getCountryById = async (id: string, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [eq(countries.id, id), eq(countries.platform_id, platformId)];

    // Step 2: Fetch country
    const country = await db.query.countries.findFirst({
        where: and(...conditions),
    });

    // Step 3: Handle not found
    if (!country) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Country not found");
    }

    return country;
};

// ----------------------------------- UPDATE COUNTRY -----------------------------------
const updateCountry = async (id: string, platformId: string, data: CountryPayload) => {
    try {
        // Step 1: Verify country exists and user has access
        const conditions: any[] = [eq(countries.id, id), eq(countries.platform_id, platformId)];

        const [existingCountry] = await db
            .select()
            .from(countries)
            .where(and(...conditions));

        if (!existingCountry) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Country not found");
        }

        // Step 2: Update country
        const [result] = await db
            .update(countries)
            .set({
                ...data,
            })
            .where(eq(countries.id, id))
            .returning();

        return result;
    } catch (error: any) {
        // Step 3: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "countries_platform_name_unique") {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Country with name "${data.name}" already exists for this platform`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A country with these details already exists"
            );
        }

        throw error;
    }
};

// ----------------------------------- DELETE COUNTRY -----------------------------------
const deleteCountry = async (id: string, platformId: string) => {
    // Step 1: Verify country exists and user has access
    const conditions: any[] = [eq(countries.id, id), eq(countries.platform_id, platformId)];

    const [existingCountry] = await db
        .select()
        .from(countries)
        .where(and(...conditions));

    if (!existingCountry) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Country not found");
    }

    // Step 2: Delete country
    await db.delete(countries).where(eq(countries.id, id));

    return null;
};

export const CountryServices = {
    createCountry,
    getCountries,
    getCountryById,
    updateCountry,
    deleteCountry,
};
