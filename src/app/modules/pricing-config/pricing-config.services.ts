import { and, eq, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { pricingConfig } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { SetPricingConfigPayload } from "./pricing-config.interfaces";

// ----------------------------------- GET PRICING CONFIG -----------------------------------
/**
 * Get warehouse operations rate for a specific company or platform default
 * @param platformId - Platform ID
 * @param companyId - Company ID (optional, null = platform default)
 * @returns Pricing configuration
 */
const getPricingConfig = async (platformId: string, companyId?: string | null): Promise<number> => {
    // Try company-specific first
    if (companyId) {
        const [companyConfig] = await db
            .select()
            .from(pricingConfig)
            .where(
                and(
                    eq(pricingConfig.platform_id, platformId),
                    eq(pricingConfig.company_id, companyId),
                    eq(pricingConfig.is_active, true)
                )
            )
            .limit(1);

        if (companyConfig) {
            return parseFloat(companyConfig.warehouse_ops_rate);
        }
    }

    // Fall back to platform default
    const [platformDefault] = await db
        .select()
        .from(pricingConfig)
        .where(
            and(
                eq(pricingConfig.platform_id, platformId),
                isNull(pricingConfig.company_id),
                eq(pricingConfig.is_active, true)
            )
        )
        .limit(1);

    if (!platformDefault) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "No pricing configuration found for this platform"
        );
    }

    return parseFloat(platformDefault.warehouse_ops_rate);
};

// ----------------------------------- GET PLATFORM DEFAULT CONFIG -----------------------------------
const getPlatformDefaultConfig = async (platformId: string) => {
    const [config] = await db
        .select()
        .from(pricingConfig)
        .where(and(eq(pricingConfig.platform_id, platformId), isNull(pricingConfig.company_id)))
        .limit(1);

    if (!config) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Platform default pricing configuration not found"
        );
    }

    return config;
};

// ----------------------------------- GET COMPANY CONFIG -----------------------------------
const getCompanyConfig = async (companyId: string, platformId: string) => {
    const [config] = await db
        .select()
        .from(pricingConfig)
        .where(
            and(eq(pricingConfig.platform_id, platformId), eq(pricingConfig.company_id, companyId))
        )
        .limit(1);

    // If no company-specific config, return platform default
    if (!config) {
        return getPlatformDefaultConfig(platformId);
    }

    return config;
};

// ----------------------------------- SET PLATFORM DEFAULT -----------------------------------
const setPlatformDefault = async (platformId: string, payload: SetPricingConfigPayload) => {
    const { warehouse_ops_rate } = payload;

    // Check if platform default exists
    const [existing] = await db
        .select()
        .from(pricingConfig)
        .where(and(eq(pricingConfig.platform_id, platformId), isNull(pricingConfig.company_id)))
        .limit(1);

    if (existing) {
        // Update existing
        const [updated] = await db
            .update(pricingConfig)
            .set({
                warehouse_ops_rate: warehouse_ops_rate.toString(),
                updated_at: new Date(),
            })
            .where(eq(pricingConfig.id, existing.id))
            .returning();

        return updated;
    } else {
        // Create new
        const [created] = await db
            .insert(pricingConfig)
            .values({
                platform_id: platformId,
                company_id: null,
                warehouse_ops_rate: warehouse_ops_rate.toString(),
                is_active: true,
            })
            .returning();

        return created;
    }
};

// ----------------------------------- SET COMPANY OVERRIDE -----------------------------------
const setCompanyOverride = async (
    companyId: string,
    platformId: string,
    payload: SetPricingConfigPayload
) => {
    const { warehouse_ops_rate } = payload;

    // Check if company override exists
    const [existing] = await db
        .select()
        .from(pricingConfig)
        .where(
            and(eq(pricingConfig.platform_id, platformId), eq(pricingConfig.company_id, companyId))
        )
        .limit(1);

    if (existing) {
        // Update existing
        const [updated] = await db
            .update(pricingConfig)
            .set({
                warehouse_ops_rate: warehouse_ops_rate.toString(),
                updated_at: new Date(),
            })
            .where(eq(pricingConfig.id, existing.id))
            .returning();

        return updated;
    } else {
        // Create new
        const [created] = await db
            .insert(pricingConfig)
            .values({
                platform_id: platformId,
                company_id: companyId,
                warehouse_ops_rate: warehouse_ops_rate.toString(),
                is_active: true,
            })
            .returning();

        return created;
    }
};

// ----------------------------------- REMOVE COMPANY OVERRIDE -----------------------------------
const removeCompanyOverride = async (companyId: string, platformId: string) => {
    const [config] = await db
        .select()
        .from(pricingConfig)
        .where(
            and(eq(pricingConfig.platform_id, platformId), eq(pricingConfig.company_id, companyId))
        )
        .limit(1);

    if (!config) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company pricing configuration not found");
    }

    await db.delete(pricingConfig).where(eq(pricingConfig.id, config.id));

    return null;
};

export const PricingConfigServices = {
    getPricingConfig,
    getPlatformDefaultConfig,
    getCompanyConfig,
    setPlatformDefault,
    setCompanyOverride,
    removeCompanyOverride,
};
