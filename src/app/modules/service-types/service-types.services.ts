import { and, asc, count, eq, ilike } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { cities, serviceTypes, transportRates, vehicleTypes } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import {
    CreateServiceTypePayload,
    SyncTransportRateCardsPayload,
    UpdateServiceTypePayload,
} from "./service-types.interfaces";

const formatServiceType = (type: any) => ({
    ...type,
    default_rate: type.default_rate ? parseFloat(type.default_rate) : null,
    default_metadata: (type.default_metadata || {}) as Record<string, unknown>,
    transport_rate_id: type.transport_rate_id || null,
});

// ----------------------------------- LIST SERVICE TYPES -----------------------------------
const listServiceTypes = async (query: Record<string, any>, platformId: string) => {
    const { page, limit, category, include_inactive, search_term } = query;

    // Setup pagination
    const { pageNumber, limitNumber, skip } = paginationMaker({
        page,
        limit,
    });

    // Build WHERE conditions
    const conditions: any[] = [eq(serviceTypes.platform_id, platformId)];

    if (category) {
        conditions.push(eq(serviceTypes.category, category as any));
    }

    if (!include_inactive) {
        conditions.push(eq(serviceTypes.is_active, true));
    }

    if (search_term) {
        conditions.push(ilike(serviceTypes.name, `%${search_term.trim()}%`));
    }

    // Always sort by display_order, then name
    const [result, total] = await Promise.all([
        db
            .select()
            .from(serviceTypes)
            .where(and(...conditions))
            .orderBy(asc(serviceTypes.display_order), asc(serviceTypes.name))
            .limit(limitNumber)
            .offset(skip),

        db
            .select({ count: count() })
            .from(serviceTypes)
            .where(and(...conditions)),
    ]);

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
        },
        data: result.map((type) => formatServiceType(type)),
    };
};

// ----------------------------------- GET SERVICE TYPE BY ID -----------------------------------
const getServiceTypeById = async (id: string, platformId: string) => {
    const [type] = await db
        .select()
        .from(serviceTypes)
        .where(and(eq(serviceTypes.id, id), eq(serviceTypes.platform_id, platformId)))
        .limit(1);

    if (!type) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service type not found");
    }

    return formatServiceType(type);
};

// ----------------------------------- CREATE SERVICE TYPE -----------------------------------
const createServiceType = async (data: CreateServiceTypePayload) => {
    const {
        platform_id,
        name,
        category,
        unit,
        default_rate,
        default_metadata,
        transport_rate_id,
        description,
        display_order,
        is_active,
    } = data;

    // Check for duplicate name
    const [existing] = await db
        .select()
        .from(serviceTypes)
        .where(and(eq(serviceTypes.platform_id, platform_id), eq(serviceTypes.name, name)))
        .limit(1);

    if (existing) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "Service type with this name already exists"
        );
    }

    console.log("create  service type data:", {
        platform_id,
        name,
        category: category as any,
        unit,
        default_rate:
            default_rate !== undefined && default_rate !== null ? default_rate.toString() : null,
        default_metadata: default_metadata || {},
        transport_rate_id: transport_rate_id || null,
        description: description || null,
        display_order: display_order ?? 0,
        is_active: is_active ?? true,
    });

    const [result] = await db
        .insert(serviceTypes)
        .values({
            platform_id,
            name,
            category: category as any,
            unit,
            default_rate:
                default_rate !== undefined && default_rate !== null
                    ? default_rate.toString()
                    : null,
            default_metadata: default_metadata || {},
            transport_rate_id: transport_rate_id || null,
            description: description || null,
            display_order: display_order ?? 0,
            is_active: is_active ?? true,
        })
        .returning();

    return formatServiceType(result);
};

// ----------------------------------- UPDATE SERVICE TYPE -----------------------------------
const updateServiceType = async (
    id: string,
    platformId: string,
    data: UpdateServiceTypePayload
) => {
    const [existing] = await db
        .select()
        .from(serviceTypes)
        .where(and(eq(serviceTypes.id, id), eq(serviceTypes.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service type not found");
    }

    // Check name uniqueness if name is being updated
    if (data.name && data.name !== existing.name) {
        const [duplicate] = await db
            .select()
            .from(serviceTypes)
            .where(and(eq(serviceTypes.platform_id, platformId), eq(serviceTypes.name, data.name)))
            .limit(1);

        if (duplicate) {
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "Service type with this name already exists"
            );
        }
    }

    const dbData: any = { ...data };
    if (data.default_rate !== undefined) {
        dbData.default_rate = data.default_rate !== null ? data.default_rate.toString() : null;
    }

    const [result] = await db
        .update(serviceTypes)
        .set(dbData)
        .where(eq(serviceTypes.id, id))
        .returning();

    return formatServiceType(result);
};

// ----------------------------------- SYNC TRANSPORT RATE CARDS ----------------------------
const syncTransportRateCards = async (
    platformId: string,
    payload: SyncTransportRateCardsPayload
): Promise<{ created: number; updated: number; skipped: number; total_rates: number }> => {
    const { include_inactive_rates } = payload;
    const conditions: any[] = [eq(transportRates.platform_id, platformId)];
    if (!include_inactive_rates) conditions.push(eq(transportRates.is_active, true));

    const rates = await db
        .select({
            id: transportRates.id,
            city_id: transportRates.city_id,
            city_name: cities.name,
            vehicle_type_id: transportRates.vehicle_type_id,
            vehicle_type_name: vehicleTypes.name,
            trip_type: transportRates.trip_type,
            rate: transportRates.rate,
            area: transportRates.area,
            is_active: transportRates.is_active,
        })
        .from(transportRates)
        .leftJoin(cities, eq(transportRates.city_id, cities.id))
        .leftJoin(vehicleTypes, eq(transportRates.vehicle_type_id, vehicleTypes.id))
        .where(and(...conditions))
        .orderBy(asc(cities.name), asc(vehicleTypes.name), asc(transportRates.trip_type));

    if (rates.length === 0) return { created: 0, updated: 0, skipped: 0, total_rates: 0 };

    const existingTransportServiceTypes = await db
        .select()
        .from(serviceTypes)
        .where(and(eq(serviceTypes.platform_id, platformId), eq(serviceTypes.category, "TRANSPORT")));

    const existingByRateId = new Map(
        existingTransportServiceTypes
            .filter((entry) => !!entry.transport_rate_id)
            .map((entry) => [entry.transport_rate_id as string, entry])
    );
    const existingByName = new Map(existingTransportServiceTypes.map((entry) => [entry.name, entry]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const [index, rate] of rates.entries()) {
        const cityName = rate.city_name || "Unknown City";
        const vehicleTypeName = rate.vehicle_type_name || "Unknown Vehicle";
        const name = `Transport - ${cityName} - ${vehicleTypeName} (${rate.trip_type})`;
        const defaultMetadata = {
            city_id: rate.city_id,
            city_name: cityName,
            vehicle_type_id: rate.vehicle_type_id,
            vehicle_type_name: vehicleTypeName,
            trip_type: rate.trip_type,
            source: "transport_rate",
            area: rate.area || null,
        };

        const serviceTypePayload = {
            name,
            category: "TRANSPORT" as const,
            unit: "trip",
            default_rate: rate.rate,
            default_metadata: defaultMetadata,
            transport_rate_id: rate.id,
            description: "Auto-synced from transport rates",
            display_order: 1000 + index,
            is_active: rate.is_active,
        };

        const existingByRate = existingByRateId.get(rate.id);
        if (existingByRate) {
            await db
                .update(serviceTypes)
                .set({ ...serviceTypePayload, default_rate: rate.rate, updated_at: new Date() })
                .where(eq(serviceTypes.id, existingByRate.id));
            updated += 1;
            continue;
        }

        const existingNameMatch = existingByName.get(name);
        if (existingNameMatch) {
            await db
                .update(serviceTypes)
                .set({
                    ...serviceTypePayload,
                    default_rate: rate.rate,
                    updated_at: new Date(),
                })
                .where(eq(serviceTypes.id, existingNameMatch.id));
            updated += 1;
            continue;
        }

        if (!rate.city_id || !rate.vehicle_type_id) {
            skipped += 1;
            continue;
        }

        await db.insert(serviceTypes).values({
            platform_id: platformId,
            ...serviceTypePayload,
            default_rate: rate.rate,
        });
        created += 1;
    }

    return { created, updated, skipped, total_rates: rates.length };
};

// ----------------------------------- DELETE SERVICE TYPE -----------------------------------
const deleteServiceType = async (id: string, platformId: string) => {
    const [existing] = await db
        .select()
        .from(serviceTypes)
        .where(and(eq(serviceTypes.id, id), eq(serviceTypes.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service type not found");
    }

    // Soft delete by setting is_active to false
    await db.update(serviceTypes).set({ is_active: false }).where(eq(serviceTypes.id, id));

    return null;
};

export const ServiceTypesServices = {
    listServiceTypes,
    getServiceTypeById,
    createServiceType,
    updateServiceType,
    deleteServiceType,
    syncTransportRateCards,
};
