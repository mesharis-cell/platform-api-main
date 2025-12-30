import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, orders, pricingTiers } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreatePricingTierPayload } from "./pricing-tier.interfaces";
import { pricingTierQueryValidationConfig, pricingTierSortableFields } from "./pricing-tier.utils";

// ----------------------------------- CREATE PRICING TIER -----------------------------------
const createPricingTier = async (data: CreatePricingTierPayload) => {
    const { country, city, volume_min, volume_max, base_price, platform_id } = data;
    try {
        const overlap = await checkVolumeOverlap(
            country,
            city,
            volume_min,
            volume_max,
            platform_id
        );

        if (overlap) {
            const overlapMax = overlap.volume_max || 'unlimited';
            throw new CustomizedError(
                httpStatus.CONFLICT,
                `Volume range ${volume_min}-${volume_max || 'unlimited'} m³ overlaps with existing tier (${overlap.volume_min}-${overlapMax} m³) for ${city}, ${country}`
            );
        }

        // Step 1: Convert number fields to strings for database
        const dbData = {
            ...data,
            volume_min: volume_min.toString(),
            volume_max: volume_max !== null && volume_max !== undefined ? volume_max.toString() : null,
            base_price: base_price.toString(),
        };

        // Step 2: Insert pricing tier into database
        const [result] = await db.insert(pricingTiers).values(dbData).returning();
        return result;
    } catch (error: any) {
        // Step 3: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === '23505') {
            if (pgError.constraint === 'pricing_tiers_unique') {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Pricing tier with this country, city, and volume range already exists`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                'A pricing tier with these details already exists'
            );
        }

        throw error;
    }
};

// ----------------------------------- GET PRICING TIER LOCATIONS ----------------------------
const getPricingTierLocations = async (platformId: string) => {
    // Step 1: Fetch only active pricing tier locations (no pricing details)
    const tiers = await db
        .select({
            country: pricingTiers.country,
            city: pricingTiers.city,
        })
        .from(pricingTiers)
        .where(
            and(
                eq(pricingTiers.platform_id, platformId),
                eq(pricingTiers.is_active, true)
            )
        );

    // Step 2: Extract unique countries
    const countries = Array.from(new Set(tiers.map((t) => t.country))).sort();

    // Step 3: Group cities by country
    const locationsByCountry: Record<string, string[]> = {};
    tiers.forEach((tier) => {
        if (!locationsByCountry[tier.country]) {
            locationsByCountry[tier.country] = [];
        }
        if (!locationsByCountry[tier.country].includes(tier.city)) {
            locationsByCountry[tier.country].push(tier.city);
        }
    });

    // Step 4: Sort cities within each country
    Object.keys(locationsByCountry).forEach((country) => {
        locationsByCountry[country].sort();
    });

    return {
        countries,
        locations_by_country: locationsByCountry,
    };
};

// ----------------------------------- GET PRICING TIERS -------------------------------------
const getPricingTiers = async (query: Record<string, any>, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        country,
        city,
        include_inactive,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(pricingTierQueryValidationConfig, "sort_by", sort_by);
    if (sort_order)
        queryValidator(pricingTierQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
        paginationMaker({
            page,
            limit,
            sort_by,
            sort_order,
        });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(pricingTiers.platform_id, platformId)];

    // Step 3a: Search by country or city
    if (search_term) {
        conditions.push(
            or(
                ilike(pricingTiers.country, `%${search_term.trim()}%`),
                ilike(pricingTiers.city, `%${search_term.trim()}%`),
            )
        );
    }

    // Step 3b: Filter by country
    if (country) {
        conditions.push(eq(pricingTiers.country, country));
    }

    // Step 3c: Filter by city
    if (city) {
        conditions.push(eq(pricingTiers.city, city));
    }

    // Step 3d: Filter by active status (default: only active pricing tiers)
    if (include_inactive !== undefined) {
        conditions.push(eq(pricingTiers.is_active, include_inactive));
    }

    // Step 4: Determine sort order
    const orderByColumn = pricingTierSortableFields[sortWith] || pricingTiers.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db
            .select()
            .from(pricingTiers)
            .where(and(...conditions))
            .orderBy(orderDirection)
            .limit(limitNumber)
            .offset(skip),

        db
            .select({
                count: count(),
            })
            .from(pricingTiers)
            .where(and(...conditions)),
    ]);

    // Step 6: Transform and return paginated response
    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
        },
        data: result.map(transformPricingTierResponse),
    };
};

// ----------------------------------- GET PRICING TIER BY ID --------------------------------
const getPricingTierById = async (id: string, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [
        eq(pricingTiers.id, id),
        eq(pricingTiers.platform_id, platformId),
    ];

    // Step 2: Fetch pricing tier
    const [pricingTier] = await db
        .select()
        .from(pricingTiers)
        .where(and(...conditions));

    // Step 3: Handle not found
    if (!pricingTier) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Pricing tier not found");
    }

    // Step 4: Transform and return pricing tier
    return transformPricingTierResponse(pricingTier);
};

// ----------------------------------- UPDATE PRICING TIER -----------------------------------
const updatePricingTier = async (id: string, data: any, platformId: string) => {
    try {
        // Step 1: Verify pricing tier exists
        const conditions: any[] = [
            eq(pricingTiers.id, id),
            eq(pricingTiers.platform_id, platformId),
        ];

        const [existingPricingTier] = await db
            .select()
            .from(pricingTiers)
            .where(and(...conditions));

        if (!existingPricingTier) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Pricing tier not found");
        }

        // Step 2: Check for volume overlap if volume fields are being updated
        const updatedCountry = data.country || existingPricingTier.country;
        const updatedCity = data.city || existingPricingTier.city;
        const updatedVolumeMin = data.volume_min !== undefined ? data.volume_min : parseFloat(existingPricingTier.volume_min);
        const updatedVolumeMax = data.volume_max !== undefined
            ? (data.volume_max !== null ? data.volume_max : null)
            : (existingPricingTier.volume_max ? parseFloat(existingPricingTier.volume_max) : null);

        // Only check overlap if volume fields are being changed
        if (data.volume_min !== undefined || data.volume_max !== undefined) {
            const overlap = await checkVolumeOverlap(
                updatedCountry,
                updatedCity,
                updatedVolumeMin,
                updatedVolumeMax,
                platformId,
                id // Exclude current tier from overlap check
            );

            if (overlap) {
                const overlapMax = overlap.volume_max || 'unlimited';
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Volume range ${updatedVolumeMin}-${updatedVolumeMax || 'unlimited'} m³ overlaps with existing tier (${overlap.volume_min}-${overlapMax} m³) for ${updatedCity}, ${updatedCountry}`
                );
            }
        }

        // Step 3: Convert number fields to strings for database
        const dbData: any = { ...data };
        if (data.volume_min !== undefined) {
            dbData.volume_min = data.volume_min.toString();
        }
        if (data.volume_max !== undefined && data.volume_max !== null) {
            dbData.volume_max = data.volume_max.toString();
        } else if (data.volume_max === null) {
            dbData.volume_max = null;
        }
        if (data.base_price !== undefined) {
            dbData.base_price = data.base_price.toString();
        }

        // Step 4: Update pricing tier
        const [result] = await db
            .update(pricingTiers)
            .set(dbData)
            .where(eq(pricingTiers.id, id))
            .returning();

        return result;
    } catch (error: any) {
        // Step 5: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === '23505') {
            if (pgError.constraint === 'pricing_tiers_unique') {
                throw new CustomizedError(
                    httpStatus.CONFLICT,
                    `Pricing tier with this country, city, and volume range already exists`
                );
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                'A pricing tier with these details already exists'
            );
        }

        throw error;
    }
};

// ----------------------------------- DELETE PRICING TIER -----------------------------------
const deletePricingTier = async (id: string, platformId: string) => {
    // Step 1: Verify pricing tier exists
    const conditions: any[] = [
        eq(pricingTiers.id, id),
        eq(pricingTiers.platform_id, platformId),
    ];

    const [existingPricingTier] = await db
        .select()
        .from(pricingTiers)
        .where(and(...conditions));

    if (!existingPricingTier) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Pricing tier not found");
    }

    // Step 2: Check if pricing tier is referenced by any orders
    const [orderReference] = await db
        .select()
        .from(orders)
        .where(eq(orders.tier_id, id))
        .limit(1);

    if (orderReference) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "Cannot delete pricing tier because it is referenced by existing orders. You can deactivate it instead."
        );
    }

    // Step 3: Permanently delete pricing tier
    await db
        .delete(pricingTiers)
        .where(eq(pricingTiers.id, id));

    return null;
};

// ----------------------------------- CALCULATE PRICING -------------------------------------
const calculatePricing = async (
    platformId: string,
    user: AuthUser,
    query: Record<string, any>
) => {
    const { country, city, volume } = query;

    // Step 1: Validate query parameters
    if (!country || typeof country !== 'string' || country.trim().length === 0) {
        throw new Error('country is required');
    }

    if (!city || typeof city !== 'string' || city.trim().length === 0) {
        throw new Error('city is required');
    }

    if (!volume || typeof volume !== 'string') {
        throw new Error('volume is required');
    }

    const volumeNumber = parseFloat(volume);
    if (isNaN(volumeNumber) || volumeNumber < 0) {
        throw new Error('volume must be a positive number');
    }

    // Step 2: Find matching pricing tier
    const matchingTier = await findMatchingTier(country, city, volumeNumber, platformId);

    if (!matchingTier) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            `No active pricing tier found for ${city}, ${country} with volume ${volumeNumber}m³`
        );
    }

    // Step 3: Get company's platform margin
    let platformMarginPercent = 25.0; // Default margin

    if (user.company_id) {
        const [company] = await db
            .select()
            .from(companies)
            .where(eq(companies.id, user.company_id));

        if (company) {
            platformMarginPercent = parseFloat(company.platform_margin_percent);
        }
    }

    // Step 4: Calculate estimated total (base price + margin)
    const a2BasePrice = matchingTier.base_price;
    const platformMarginAmount = a2BasePrice * (platformMarginPercent / 100);
    const estimatedTotal = a2BasePrice + platformMarginAmount;

    // Step 5: Return calculation result
    return {
        pricing_tier_id: matchingTier.id,
        country: matchingTier.country,
        city: matchingTier.city,
        volume_min: matchingTier.volume_min,
        volume_max: matchingTier.volume_max,
        base_price: parseFloat(a2BasePrice.toFixed(2)), // A2 flat rate for this tier
        platform_margin_percent: parseFloat(platformMarginPercent.toFixed(2)),
        platform_margin_amount: parseFloat(platformMarginAmount.toFixed(2)),
        estimated_total: parseFloat(estimatedTotal.toFixed(2)), // Final estimate with margin
        matched_volume: volume,
        note: 'This is a flat rate for the volume range, not a per-m³ rate',
    };
};

// ----------------------------------- HELPER FUNCTIONS --------------------------------------
const checkVolumeOverlap = async (
    country: string,
    city: string,
    volumeMin: number,
    volumeMax: number | null | undefined,
    platformId: string,
    excludeId?: string
): Promise<any | null> => {
    const conditions: any[] = [
        eq(pricingTiers.country, country),
        eq(pricingTiers.city, city),
        eq(pricingTiers.platform_id, platformId),
        eq(pricingTiers.is_active, true),
    ];

    if (excludeId) {
        conditions.push(sql`${pricingTiers.id} != ${excludeId}`);
    }

    const existingTiers = await db
        .select()
        .from(pricingTiers)
        .where(and(...conditions));

    for (const tier of existingTiers) {
        const tierMin = parseFloat(tier.volume_min);
        const tierMax = tier.volume_max ? parseFloat(tier.volume_max) : Infinity;
        const newMax = volumeMax !== null && volumeMax !== undefined ? volumeMax : Infinity;

        // Check if ranges overlap: (start1 < end2) AND (start2 < end1)
        if (volumeMin < tierMax && tierMin < newMax) {
            return tier;
        }
    }

    return null;
};

// Transform pricing tier response to convert string fields to numbers
const transformPricingTierResponse = (tier: any) => {
    return {
        ...tier,
        volume_min: parseFloat(tier.volume_min),
        volume_max: tier.volume_max ? parseFloat(tier.volume_max) : null,
        base_price: parseFloat(tier.base_price),
    };
};

// Helper function to find matching pricing tier
const findMatchingTier = async (
    country: string,
    city: string,
    volume: number,
    platformId: string
): Promise<any | null> => {
    // Find active tiers where volumeMin <= volume < volumeMax
    // Order by smallest range first to get most specific tier
    const matchingTiers = await db
        .select()
        .from(pricingTiers)
        .where(
            and(
                eq(pricingTiers.country, country),
                eq(pricingTiers.city, city),
                eq(pricingTiers.platform_id, platformId),
                eq(pricingTiers.is_active, true),
                sql`CAST(${pricingTiers.volume_min} AS DECIMAL) <= ${volume}`,
                or(
                    sql`${pricingTiers.volume_max} IS NULL`,
                    sql`CAST(${pricingTiers.volume_max} AS DECIMAL) > ${volume}`
                )
            )
        )
        .orderBy(
            asc(
                sql`CASE WHEN ${pricingTiers.volume_max} IS NULL THEN 999999999 ELSE CAST(${pricingTiers.volume_max} AS DECIMAL) - CAST(${pricingTiers.volume_min} AS DECIMAL) END`
            )
        )
        .limit(1);

    return matchingTiers.length > 0
        ? transformPricingTierResponse(matchingTiers[0])
        : null;
};

export const PricingTierServices = {
    createPricingTier,
    getPricingTiers,
    getPricingTierById,
    updatePricingTier,
    deletePricingTier,
    getPricingTierLocations,
    calculatePricing,
};
