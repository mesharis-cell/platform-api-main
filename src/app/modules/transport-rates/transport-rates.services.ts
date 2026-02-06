import { and, asc, count, desc, eq, isNull, getTableColumns } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { cities, companies, transportRates } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import {
    CreateTransportRatePayload,
    TripType,
    UpdateTransportRatePayload,
} from "./transport-rates.interfaces";
import { uuidRegex } from "../../constants/common";

// ----------------------------------- LOOKUP TRANSPORT RATE ----------------------------------
const lookupTransportRate = async (
    platformId: string,
    companyId: string | null,
    city: string,
    tripType: TripType,
    vehicleTypeId: string
) => {
    // Step 1: Check if city is a valid UUID
    const isUUID = uuidRegex.test(city);

    // Step 2: Build where condition for city based on input type 
    const whereCondition = isUUID
        ? and(
            eq(cities.id, city),
            eq(cities.platform_id, platformId)
        )
        : and(eq(cities.name, city), eq(cities.platform_id, platformId));

    // Step 3: Fetch order with relations
    const [cityInfo] = await db
        .select()
        .from(cities)
        .where(whereCondition)
        .limit(1);

    if (!cityInfo) {
        return null;
    }

    // Step 1: Try company-specific rate first
    if (companyId) {
        const [companyRate] = await db
            .select()
            .from(transportRates)
            .where(
                and(
                    eq(transportRates.platform_id, platformId),
                    eq(transportRates.company_id, companyId),
                    eq(transportRates.city_id, cityInfo.id),
                    eq(transportRates.trip_type, tripType),
                    eq(transportRates.vehicle_type_id, vehicleTypeId),
                    eq(transportRates.is_active, true)
                )
            )
            .limit(1);

        if (companyRate) {
            return companyRate;
        }
    }

    // Step 2: Fall back to platform default
    const [platformRate] = await db
        .select()
        .from(transportRates)
        .where(
            and(
                eq(transportRates.platform_id, platformId),
                isNull(transportRates.company_id),
                eq(transportRates.city_id, cityInfo.id),
                eq(transportRates.trip_type, tripType),
                eq(transportRates.vehicle_type_id, vehicleTypeId),
                eq(transportRates.is_active, true)
            )
        )
        .limit(1);

    if (!platformRate) {
        return null;
        // throw new CustomizedError(
        //     httpStatus.NOT_FOUND,
        //     `No transport rate found for ${cityInfo.name} / ${tripType} / ${vehicleType}`
        // );
    }

    return platformRate;
};

// ----------------------------------- LIST TRANSPORT RATES -----------------------------------
const listTransportRates = async (query: Record<string, any>, platformId: string) => {
    const {
        page,
        limit,
        sort_by,
        sort_order,
        emirate,
        trip_type,
        vehicle_type_id,
        company_id,
        include_inactive,
    } = query;

    // Setup pagination
    const { pageNumber, limitNumber, skip } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Build WHERE conditions
    const conditions: any[] = [eq(transportRates.platform_id, platformId)];

    if (emirate) {
        conditions.push(eq(transportRates.city_id, emirate));
    }

    if (trip_type) {
        conditions.push(eq(transportRates.trip_type, trip_type as any));
    }

    if (vehicle_type_id) {
        conditions.push(eq(transportRates.vehicle_type_id, vehicle_type_id));
    }

    if (company_id !== undefined) {
        if (company_id === null || company_id === "null") {
            conditions.push(isNull(transportRates.company_id));
        } else {
            conditions.push(eq(transportRates.company_id, company_id));
        }
    }

    if (!include_inactive) {
        conditions.push(eq(transportRates.is_active, true));
    }

    // Determine sort order
    const orderByColumn = transportRates.created_at;
    const orderDirection = sort_order === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Execute queries in parallel
    const [result, total] = await Promise.all([
        db
            .select({
                ...getTableColumns(transportRates),
                city: {
                    id: cities.id,
                    name: cities.name,
                },
                company: {
                    id: companies.id,
                    name: companies.name,
                },
            })
            .from(transportRates)
            .leftJoin(cities, eq(transportRates.city_id, cities.id))
            .leftJoin(companies, eq(transportRates.company_id, companies.id))
            .where(and(...conditions))
            .orderBy(orderDirection)
            .limit(limitNumber)
            .offset(skip),

        db
            .select({ count: count() })
            .from(transportRates)
            .where(and(...conditions)),
    ]);

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
        },
        data: result.map((rate) => ({
            ...rate,
            rate: parseFloat(rate.rate),
        })),
    };
};

// ----------------------------------- GET TRANSPORT RATE BY ID -----------------------------------
const getTransportRateById = async (id: string, platformId: string) => {
    const [rate] = await db
        .select()
        .from(transportRates)
        .where(and(eq(transportRates.id, id), eq(transportRates.platform_id, platformId)))
        .limit(1);

    if (!rate) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Transport rate not found");
    }

    return {
        ...rate,
        rate: parseFloat(rate.rate),
    };
};

// ----------------------------------- CREATE TRANSPORT RATE -----------------------------------
const createTransportRate = async (data: CreateTransportRatePayload) => {
    const { platform_id, company_id, city_id, area, trip_type, vehicle_type_id, rate, is_active } =
        data;

    // Check for duplicate
    const existing = await db
        .select()
        .from(transportRates)
        .where(
            and(
                eq(transportRates.platform_id, platform_id),
                company_id
                    ? eq(transportRates.company_id, company_id)
                    : isNull(transportRates.company_id),
                eq(transportRates.city_id, city_id),
                area ? eq(transportRates.area, area) : isNull(transportRates.area),
                eq(transportRates.trip_type, trip_type as any),
                eq(transportRates.vehicle_type_id, vehicle_type_id as any)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "Transport rate already exists for this configuration"
        );
    }

    const [result] = await db
        .insert(transportRates)
        .values({
            platform_id,
            company_id: company_id || null,
            city_id: city_id,
            area: area || null,
            trip_type: trip_type,
            vehicle_type_id: vehicle_type_id,
            rate: rate.toString(),
            is_active: is_active ?? true,
        })
        .returning();

    return {
        ...result,
        rate: parseFloat(result.rate),
    };
};

// ----------------------------------- UPDATE TRANSPORT RATE -----------------------------------
const updateTransportRate = async (
    id: string,
    platformId: string,
    data: UpdateTransportRatePayload
) => {
    const [existing] = await db
        .select()
        .from(transportRates)
        .where(and(eq(transportRates.id, id), eq(transportRates.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Transport rate not found");
    }

    const dbData: any = { ...data };
    if (data.rate !== undefined) {
        dbData.rate = data.rate.toString();
    }

    const [result] = await db
        .update(transportRates)
        .set(dbData)
        .where(eq(transportRates.id, id))
        .returning();

    return {
        ...result,
        rate: parseFloat(result.rate),
    };
};

// ----------------------------------- DELETE TRANSPORT RATE -----------------------------------
const deleteTransportRate = async (id: string, platformId: string) => {
    const [existing] = await db
        .select()
        .from(transportRates)
        .where(and(eq(transportRates.id, id), eq(transportRates.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Transport rate not found");
    }

    // Soft delete by setting is_active to false
    await db.update(transportRates).set({ is_active: false }).where(eq(transportRates.id, id));

    return null;
};

export const TransportRatesServices = {
    lookupTransportRate,
    listTransportRates,
    getTransportRateById,
    createTransportRate,
    updateTransportRate,
    deleteTransportRate,
};
