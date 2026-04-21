import { and, eq, inArray, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assets } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import {
    addBusinessDays,
    computeLeadFloorDate,
    computeLeadFloorDatetime,
    formatDateInTimezone,
    getPlatformFeasibilityConfig as getPlatformFeasibilityConfigShared,
    type FeasibilityConfig,
} from "../../shared/feasibility/feasibility.core";

// Re-export shared primitives so existing callers of this module continue
// to work without changing imports. New callers should import directly
// from `../../shared/feasibility/feasibility.core`.
export type { FeasibilityConfig } from "../../shared/feasibility/feasibility.core";
export {
    DEFAULT_FEASIBILITY_CONFIG,
    resolveFeasibilityConfig,
    getWeekdayInTimezone,
    isWeekend,
    addBusinessDays,
    advanceToNextBusinessDay,
    formatDateInTimezone,
    computeLeadFloorDate,
    computeLeadFloorDatetime,
} from "../../shared/feasibility/feasibility.core";
export const getPlatformFeasibilityConfig = getPlatformFeasibilityConfigShared;

type MaintenanceDecision = "FIX_IN_ORDER" | "USE_AS_IS";

type MaintenanceFeasibilityInputItem = {
    asset_id: string;
    maintenance_decision?: MaintenanceDecision;
};

type MaintenanceFeasibilityIssue = {
    asset_id: string;
    asset_name: string;
    refurb_days_estimate: number;
    earliest_feasible_date: string;
    earliest_feasible_datetime: string;
    condition: "RED" | "ORANGE";
    maintenance_mode: "MANDATORY_RED" | "OPTIONAL_ORANGE_FIX";
    message: string;
};

const buildFeasibilityIssue = (
    asset: {
        id: string;
        name: string;
        condition: "RED" | "ORANGE";
        refurb_days_estimate: number | null;
    },
    readyDate: Date,
    config: FeasibilityConfig
): MaintenanceFeasibilityIssue => {
    const refurbDays = Number(asset.refurb_days_estimate || 0);
    const earliestDate = formatDateInTimezone(readyDate, config.timezone);
    const earliestDatetime = readyDate.toISOString();
    const isRed = asset.condition === "RED";
    return {
        asset_id: asset.id,
        asset_name: asset.name,
        refurb_days_estimate: refurbDays,
        earliest_feasible_date: earliestDate,
        earliest_feasible_datetime: earliestDatetime,
        condition: asset.condition,
        maintenance_mode: isRed ? "MANDATORY_RED" : "OPTIONAL_ORANGE_FIX",
        message: isRed
            ? `${asset.name} is RED and requires ${refurbDays} business day(s) refurbishment after minimum lead time. Earliest feasible date: ${earliestDate}`
            : `${asset.name} is ORANGE and selected as FIX_IN_ORDER. It requires ${refurbDays} business day(s) refurbishment after minimum lead time. Earliest feasible date: ${earliestDate}`,
    };
};

const normalizeFeasibilityItems = (
    items: MaintenanceFeasibilityInputItem[]
): MaintenanceFeasibilityInputItem[] => {
    const map = new Map<string, MaintenanceDecision | undefined>();
    for (const item of items) {
        const current = map.get(item.asset_id);
        if (!current) {
            map.set(item.asset_id, item.maintenance_decision);
            continue;
        }
        if (current === "FIX_IN_ORDER" || item.maintenance_decision === "FIX_IN_ORDER") {
            map.set(item.asset_id, "FIX_IN_ORDER");
        } else if (current === undefined && item.maintenance_decision) {
            map.set(item.asset_id, item.maintenance_decision);
        }
    }

    return Array.from(map.entries()).map(([asset_id, maintenance_decision]) => ({
        asset_id,
        maintenance_decision,
    }));
};

export const validateMaintenanceFeasibilityForAssets = async (
    platformId: string,
    companyId: string | null | undefined,
    items: MaintenanceFeasibilityInputItem[],
    eventStartDate: Date
): Promise<{
    feasible: boolean;
    config: FeasibilityConfig;
    issues: MaintenanceFeasibilityIssue[];
    lead_floor_date: string;
    lead_floor_datetime: string;
}> => {
    if (items.length === 0) {
        const cfg = await getPlatformFeasibilityConfigShared(platformId, companyId);
        return {
            feasible: true,
            config: cfg,
            issues: [],
            lead_floor_date: computeLeadFloorDate(cfg),
            lead_floor_datetime: computeLeadFloorDatetime(cfg),
        };
    }

    const config = await getPlatformFeasibilityConfigShared(platformId, companyId);

    const normalizedItems = normalizeFeasibilityItems(items);
    const uniqueAssetIds = normalizedItems.map((item) => item.asset_id);
    const foundAssets = await db
        .select({
            id: assets.id,
            name: assets.name,
            condition: assets.condition,
            refurb_days_estimate: assets.refurb_days_estimate,
        })
        .from(assets)
        .where(
            and(
                inArray(assets.id, uniqueAssetIds),
                eq(assets.platform_id, platformId),
                isNull(assets.deleted_at)
            )
        );

    const missingIds = uniqueAssetIds.filter((id) => !foundAssets.some((asset) => asset.id === id));
    if (missingIds.length > 0) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "One or more assets not found");
    }

    const leadWindowStart = new Date(Date.now() + config.minimum_lead_hours * 60 * 60 * 1000);

    const issues: MaintenanceFeasibilityIssue[] = foundAssets
        .filter((asset) => {
            if (asset.condition === "RED") return true;
            if (asset.condition !== "ORANGE") return false;
            const input = normalizedItems.find((item) => item.asset_id === asset.id);
            return input?.maintenance_decision === "FIX_IN_ORDER";
        })
        .map((asset) => {
            const refurbDays = Number(asset.refurb_days_estimate || 0);
            const readyDate = addBusinessDays(leadWindowStart, refurbDays, config);
            // Compare full datetimes — time-of-day is meaningful now that the
            // client sends ISO with platform-TZ offset (see composeZonedISO
            // on the client). Reverts dafe89e's calendar-only comparison,
            // which was a temporary fix for the old date-only client.
            const isFeasible = eventStartDate.getTime() >= readyDate.getTime();

            if (isFeasible) return null;
            return buildFeasibilityIssue(
                asset as {
                    id: string;
                    name: string;
                    condition: "RED" | "ORANGE";
                    refurb_days_estimate: number | null;
                },
                readyDate,
                config
            );
        })
        .filter((issue): issue is MaintenanceFeasibilityIssue => issue !== null);

    return {
        feasible: issues.length === 0,
        config,
        issues,
        lead_floor_date: computeLeadFloorDate(config),
        lead_floor_datetime: computeLeadFloorDatetime(config),
    };
};

export const validateRedFeasibilityForAssets = async (
    platformId: string,
    assetIds: string[],
    eventStartDate: Date
) =>
    validateMaintenanceFeasibilityForAssets(
        platformId,
        null,
        assetIds.map((asset_id) => ({ asset_id })),
        eventStartDate
    );
