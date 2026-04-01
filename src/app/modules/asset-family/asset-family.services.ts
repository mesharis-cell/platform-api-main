import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assetBookings,
    assetFamilies,
    assets,
    brands,
    companies,
    orders,
    scanEvents,
    selfBookingItems,
    teams,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import { CreateAssetFamilyPayload, UpdateAssetFamilyPayload } from "./asset-family.interfaces";

const validateFamilyScope = async (
    platformId: string,
    payload: {
        company_id: string;
        brand_id?: string | null;
        team_id?: string | null;
    }
) => {
    const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
            and(
                eq(companies.id, payload.company_id),
                eq(companies.platform_id, platformId),
                isNull(companies.deleted_at)
            )
        );

    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
    }

    if (payload.brand_id) {
        const [brand] = await db
            .select({ id: brands.id })
            .from(brands)
            .where(and(eq(brands.id, payload.brand_id), eq(brands.company_id, payload.company_id)));

        if (!brand) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Brand not found or does not belong to the specified company"
            );
        }
    }

    if (payload.team_id) {
        const [team] = await db
            .select({ id: teams.id })
            .from(teams)
            .where(
                and(
                    eq(teams.id, payload.team_id),
                    eq(teams.company_id, payload.company_id),
                    eq(teams.platform_id, platformId)
                )
            );

        if (!team) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Team not found or does not belong to the specified company"
            );
        }
    }
};

const buildAggregatePredicate = (stockFilterPredicate?: any, extraPredicate?: any) => {
    const predicates = [sql`${assets.id} is not null`];

    if (stockFilterPredicate) {
        predicates.push(stockFilterPredicate);
    }

    if (extraPredicate) {
        predicates.push(extraPredicate);
    }

    return predicates.length === 1 ? predicates[0] : and(...predicates);
};

const buildCountExpr = (predicate?: any) =>
    sql<number>`cast(coalesce(sum(case when ${predicate} then 1 else 0 end), 0) as integer)`;

const buildQuantityExpr = (column: any, predicate?: any) =>
    sql<number>`cast(coalesce(sum(case when ${predicate} then coalesce(${column}, 0) else 0 end), 0) as integer)`;

const buildAssetFamilySelect = (stockFilterPredicate?: any) => {
    const stockMatchPredicate = buildAggregatePredicate(stockFilterPredicate);

    return {
        id: assetFamilies.id,
        platform_id: assetFamilies.platform_id,
        company_id: assetFamilies.company_id,
        brand_id: assetFamilies.brand_id,
        team_id: assetFamilies.team_id,
        name: assetFamilies.name,
        company_item_code: assetFamilies.company_item_code,
        description: assetFamilies.description,
        category: assetFamilies.category,
        images: assetFamilies.images,
        on_display_image: assetFamilies.on_display_image,
        stock_mode: assetFamilies.stock_mode,
        packaging: assetFamilies.packaging,
        weight_per_unit: assetFamilies.weight_per_unit,
        dimensions: assetFamilies.dimensions,
        volume_per_unit: assetFamilies.volume_per_unit,
        handling_tags: assetFamilies.handling_tags,
        is_active: assetFamilies.is_active,
        created_at: assetFamilies.created_at,
        updated_at: assetFamilies.updated_at,
        deleted_at: assetFamilies.deleted_at,
        company: {
            id: companies.id,
            name: companies.name,
        },
        brand: {
            id: brands.id,
            name: brands.name,
        },
        team: {
            id: teams.id,
            name: teams.name,
        },
        stock_record_count: buildCountExpr(stockMatchPredicate),
        asset_count: buildCountExpr(stockMatchPredicate),
        total_quantity: buildQuantityExpr(assets.total_quantity, stockMatchPredicate),
        available_quantity: buildQuantityExpr(assets.available_quantity, stockMatchPredicate),
        status_summary: {
            available: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.status, "AVAILABLE"))
            ),
            booked: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.status, "BOOKED"))
            ),
            out: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.status, "OUT"))
            ),
            maintenance: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.status, "MAINTENANCE"))
            ),
            transformed: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.status, "TRANSFORMED"))
            ),
        },
        condition_summary: {
            green: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.condition, "GREEN"))
            ),
            orange: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.condition, "ORANGE"))
            ),
            red: buildCountExpr(
                buildAggregatePredicate(stockFilterPredicate, eq(assets.condition, "RED"))
            ),
        },
    } as const;
};

const assetFamilyGroupBy = [
    assetFamilies.id,
    assetFamilies.platform_id,
    assetFamilies.company_id,
    assetFamilies.brand_id,
    assetFamilies.team_id,
    assetFamilies.name,
    assetFamilies.company_item_code,
    assetFamilies.description,
    assetFamilies.category,
    assetFamilies.images,
    assetFamilies.on_display_image,
    assetFamilies.stock_mode,
    assetFamilies.packaging,
    assetFamilies.weight_per_unit,
    assetFamilies.dimensions,
    assetFamilies.volume_per_unit,
    assetFamilies.handling_tags,
    assetFamilies.is_active,
    assetFamilies.created_at,
    assetFamilies.updated_at,
    assetFamilies.deleted_at,
    companies.id,
    companies.name,
    brands.id,
    brands.name,
    teams.id,
    teams.name,
] as const;

const listAssetFamilies = async (
    platformId: string,
    user: { role: string; company_id?: string | null },
    query: Record<string, unknown>
) => {
    const { pageNumber, limitNumber, skip } = paginationMaker({
        page: Number(query.page),
        limit: Number(query.limit),
    });
    const companyId =
        typeof query.company_id === "string"
            ? query.company_id
            : typeof query.company === "string"
              ? query.company
              : undefined;
    const brandId =
        typeof query.brand_id === "string"
            ? query.brand_id
            : typeof query.brand === "string"
              ? query.brand
              : undefined;
    const teamId =
        typeof query.team_id === "string"
            ? query.team_id
            : typeof query.team === "string"
              ? query.team
              : undefined;
    const warehouseId =
        typeof query.warehouse_id === "string"
            ? query.warehouse_id
            : typeof query.warehouse === "string"
              ? query.warehouse
              : undefined;
    const zoneId =
        typeof query.zone_id === "string"
            ? query.zone_id
            : typeof query.zone === "string"
              ? query.zone
              : undefined;

    const familyConditions = [
        eq(assetFamilies.platform_id, platformId),
        isNull(assetFamilies.deleted_at),
    ];

    if (user.role === "CLIENT") {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
        familyConditions.push(eq(assetFamilies.company_id, user.company_id));
    } else if (companyId) {
        familyConditions.push(eq(assetFamilies.company_id, companyId));
    }

    if (brandId) {
        familyConditions.push(eq(assetFamilies.brand_id, brandId));
    }

    if (teamId) {
        familyConditions.push(eq(assetFamilies.team_id, teamId));
    }

    if (typeof query.category === "string" && query.category) {
        familyConditions.push(eq(assetFamilies.category, query.category));
    }

    if (typeof query.stock_mode === "string" && query.stock_mode) {
        familyConditions.push(eq(assetFamilies.stock_mode, query.stock_mode as any));
    }

    if (typeof query.search_term === "string" && query.search_term.trim()) {
        const searchTerm = query.search_term.trim();
        familyConditions.push(
            or(
                ilike(assetFamilies.name, `%${searchTerm}%`),
                ilike(assetFamilies.company_item_code, `%${searchTerm}%`)
            )!
        );
    }

    const stockFilterConditions: any[] = [];
    if (warehouseId) {
        stockFilterConditions.push(eq(assets.warehouse_id, warehouseId));
    }
    if (zoneId) {
        stockFilterConditions.push(eq(assets.zone_id, zoneId));
    }
    if (typeof query.status === "string" && query.status) {
        stockFilterConditions.push(eq(assets.status, query.status as any));
    }
    if (typeof query.condition === "string" && query.condition.trim()) {
        const conditionValues = query.condition
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

        if (conditionValues.length === 1) {
            stockFilterConditions.push(eq(assets.condition, conditionValues[0] as any));
        } else if (conditionValues.length > 1) {
            stockFilterConditions.push(inArray(assets.condition, conditionValues as any));
        }
    }

    if (query.include_inactive !== "true") {
        familyConditions.push(eq(assetFamilies.is_active, true));
    }

    const stockFilterPredicate =
        stockFilterConditions.length > 0 ? and(...stockFilterConditions) : undefined;
    const assetFamilySelect = buildAssetFamilySelect(stockFilterPredicate);

    const [result, total] = await Promise.all([
        db
            .select(assetFamilySelect)
            .from(assetFamilies)
            .leftJoin(companies, eq(companies.id, assetFamilies.company_id))
            .leftJoin(brands, eq(brands.id, assetFamilies.brand_id))
            .leftJoin(teams, eq(teams.id, assetFamilies.team_id))
            .leftJoin(
                assets,
                and(eq(assets.family_id, assetFamilies.id), isNull(assets.deleted_at))
            )
            .where(and(...familyConditions))
            .groupBy(...assetFamilyGroupBy)
            .orderBy(asc(assetFamilies.name))
            .limit(limitNumber)
            .offset(skip),
        db
            .select({ count: count() })
            .from(assetFamilies)
            .where(and(...familyConditions)),
    ]);

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0]?.count ?? 0,
        },
        data: result,
    };
};

const getAssetFamilyById = async (
    id: string,
    platformId: string,
    user?: { role?: string; company_id?: string | null }
) => {
    const conditions = [
        eq(assetFamilies.id, id),
        eq(assetFamilies.platform_id, platformId),
        isNull(assetFamilies.deleted_at),
    ];

    if (user?.role === "CLIENT") {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
        conditions.push(eq(assetFamilies.company_id, user.company_id));
    }

    const [result] = await db
        .select(buildAssetFamilySelect())
        .from(assetFamilies)
        .leftJoin(companies, eq(companies.id, assetFamilies.company_id))
        .leftJoin(brands, eq(brands.id, assetFamilies.brand_id))
        .leftJoin(teams, eq(teams.id, assetFamilies.team_id))
        .leftJoin(assets, and(eq(assets.family_id, assetFamilies.id), isNull(assets.deleted_at)))
        .where(and(...conditions))
        .groupBy(...assetFamilyGroupBy);

    if (!result) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset family not found");
    }

    return result;
};

const getAssetFamilyAvailabilityStats = async (
    id: string,
    platformId: string,
    user?: { role?: string; company_id?: string | null }
) => {
    const family = await getAssetFamilyById(id, platformId, user);

    const familyAssets = await db
        .select({
            id: assets.id,
            total_quantity: assets.total_quantity,
            condition: assets.condition,
        })
        .from(assets)
        .where(
            and(
                eq(assets.family_id, id),
                eq(assets.platform_id, platformId),
                isNull(assets.deleted_at)
            )
        );

    const assetIds = familyAssets.map((asset) => asset.id);
    const totalQuantity = familyAssets.reduce(
        (sum, asset) => sum + Number(asset.total_quantity || 0),
        0
    );

    if (assetIds.length === 0) {
        return {
            family_id: family.id,
            total_quantity: totalQuantity,
            available_quantity: totalQuantity,
            booked_quantity: 0,
            out_quantity: 0,
            in_maintenance_quantity: 0,
            self_booked_quantity: 0,
            stock_record_count: 0,
            breakdown: {
                active_bookings_count: 0,
                outbound_scans_total: 0,
                inbound_scans_total: 0,
            },
        };
    }

    const activeBookings = await db
        .select({
            quantity: assetBookings.quantity,
        })
        .from(assetBookings)
        .innerJoin(orders, eq(assetBookings.order_id, orders.id))
        .where(
            and(
                inArray(assetBookings.asset_id, assetIds),
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

    const outboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(and(inArray(scanEvents.asset_id, assetIds), eq(scanEvents.scan_type, "OUTBOUND")));

    const inboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(and(inArray(scanEvents.asset_id, assetIds), eq(scanEvents.scan_type, "INBOUND")));

    const [selfBookedRow] = await db
        .select({
            total: sql<number>`COALESCE(SUM(${selfBookingItems.quantity} - ${selfBookingItems.returned_quantity}), 0)`,
        })
        .from(selfBookingItems)
        .where(
            and(inArray(selfBookingItems.asset_id, assetIds), eq(selfBookingItems.status, "OUT"))
        );

    const bookedQuantity = activeBookings.reduce(
        (sum, booking) => sum + Number(booking.quantity || 0),
        0
    );
    const totalOutbound = outboundScans.reduce((sum, scan) => sum + Number(scan.quantity || 0), 0);
    const totalInbound = inboundScans.reduce((sum, scan) => sum + Number(scan.quantity || 0), 0);
    const outQuantity = Math.max(0, totalOutbound - totalInbound);
    const inMaintenanceQuantity = familyAssets.reduce(
        (sum, asset) => (asset.condition === "RED" ? sum + Number(asset.total_quantity || 0) : sum),
        0
    );
    const selfBookedQuantity = Number(selfBookedRow?.total ?? 0);
    const availableQuantity = Math.max(
        0,
        totalQuantity - bookedQuantity - outQuantity - inMaintenanceQuantity - selfBookedQuantity
    );

    return {
        family_id: family.id,
        total_quantity: totalQuantity,
        available_quantity: availableQuantity,
        booked_quantity: bookedQuantity,
        out_quantity: outQuantity,
        in_maintenance_quantity: inMaintenanceQuantity,
        self_booked_quantity: selfBookedQuantity,
        stock_record_count: assetIds.length,
        breakdown: {
            active_bookings_count: activeBookings.length,
            outbound_scans_total: totalOutbound,
            inbound_scans_total: totalInbound,
        },
    };
};

const createAssetFamily = async (platformId: string, payload: CreateAssetFamilyPayload) => {
    await validateFamilyScope(platformId, payload);

    const [created] = await db
        .insert(assetFamilies)
        .values({
            platform_id: platformId,
            company_id: payload.company_id,
            brand_id: payload.brand_id ?? null,
            team_id: payload.team_id ?? null,
            name: payload.name.trim(),
            company_item_code: payload.company_item_code?.trim() || null,
            description: payload.description ?? null,
            category: payload.category.trim(),
            images: payload.images ?? [],
            on_display_image: payload.on_display_image ?? null,
            stock_mode: payload.stock_mode,
            packaging: payload.packaging ?? null,
            weight_per_unit:
                payload.weight_per_unit === undefined || payload.weight_per_unit === null
                    ? null
                    : payload.weight_per_unit.toString(),
            dimensions: payload.dimensions ?? {},
            volume_per_unit:
                payload.volume_per_unit === undefined || payload.volume_per_unit === null
                    ? null
                    : payload.volume_per_unit.toString(),
            handling_tags: payload.handling_tags ?? [],
            is_active: payload.is_active ?? true,
        })
        .returning();

    return created;
};

const updateAssetFamily = async (
    id: string,
    platformId: string,
    payload: UpdateAssetFamilyPayload
) => {
    const existing = await getAssetFamilyById(id, platformId);

    await validateFamilyScope(platformId, {
        company_id: payload.company_id ?? existing.company_id,
        brand_id: payload.brand_id === undefined ? existing.brand_id : payload.brand_id,
        team_id: payload.team_id === undefined ? existing.team_id : payload.team_id,
    });

    const [updated] = await db
        .update(assetFamilies)
        .set({
            ...(payload.company_id !== undefined && { company_id: payload.company_id }),
            ...(payload.brand_id !== undefined && { brand_id: payload.brand_id ?? null }),
            ...(payload.team_id !== undefined && { team_id: payload.team_id ?? null }),
            ...(payload.name !== undefined && { name: payload.name.trim() }),
            ...(payload.company_item_code !== undefined && {
                company_item_code: payload.company_item_code?.trim() || null,
            }),
            ...(payload.description !== undefined && { description: payload.description ?? null }),
            ...(payload.category !== undefined && { category: payload.category.trim() }),
            ...(payload.images !== undefined && { images: payload.images }),
            ...(payload.on_display_image !== undefined && {
                on_display_image: payload.on_display_image ?? null,
            }),
            ...(payload.stock_mode !== undefined && { stock_mode: payload.stock_mode }),
            ...(payload.packaging !== undefined && { packaging: payload.packaging ?? null }),
            ...(payload.weight_per_unit !== undefined && {
                weight_per_unit:
                    payload.weight_per_unit === null ? null : payload.weight_per_unit.toString(),
            }),
            ...(payload.dimensions !== undefined && { dimensions: payload.dimensions }),
            ...(payload.volume_per_unit !== undefined && {
                volume_per_unit:
                    payload.volume_per_unit === null ? null : payload.volume_per_unit.toString(),
            }),
            ...(payload.handling_tags !== undefined && { handling_tags: payload.handling_tags }),
            ...(payload.is_active !== undefined && { is_active: payload.is_active }),
            updated_at: new Date(),
        })
        .where(and(eq(assetFamilies.id, id), eq(assetFamilies.platform_id, platformId)))
        .returning();

    return updated;
};

const deleteAssetFamily = async (id: string, platformId: string) => {
    await getAssetFamilyById(id, platformId);

    const [linkedAssets] = await db
        .select({ count: count(assets.id) })
        .from(assets)
        .where(
            and(
                eq(assets.platform_id, platformId),
                eq(assets.family_id, id),
                isNull(assets.deleted_at)
            )
        );

    if ((linkedAssets?.count ?? 0) > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Cannot delete an asset family that is linked to assets"
        );
    }

    const [deleted] = await db
        .update(assetFamilies)
        .set({
            is_active: false,
            deleted_at: new Date(),
            updated_at: new Date(),
        })
        .where(and(eq(assetFamilies.id, id), eq(assetFamilies.platform_id, platformId)))
        .returning({ id: assetFamilies.id });

    return deleted;
};

export const AssetFamilyServices = {
    listAssetFamilies,
    getAssetFamilyById,
    getAssetFamilyAvailabilityStats,
    createAssetFamily,
    updateAssetFamily,
    deleteAssetFamily,
};
