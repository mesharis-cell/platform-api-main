import { and, eq, inArray, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assets, companies, platforms } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";

type FeasibilityConfig = {
    minimum_lead_hours: number;
    exclude_weekends: boolean;
    weekend_days: number[];
    timezone: string;
};

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

const DEFAULT_FEASIBILITY_CONFIG: FeasibilityConfig = {
    minimum_lead_hours: 24,
    exclude_weekends: true,
    weekend_days: [0, 6],
    timezone: "Asia/Dubai",
};

const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

const toPositiveNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
};

const resolveWeekendDays = (value: unknown): number[] => {
    if (!Array.isArray(value)) return DEFAULT_FEASIBILITY_CONFIG.weekend_days;
    const valid = value
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (valid.length === 0) return DEFAULT_FEASIBILITY_CONFIG.weekend_days;
    return Array.from(new Set(valid));
};

const resolveFeasibilityConfig = (config: unknown): FeasibilityConfig => {
    const feasibility = (config as any)?.feasibility || {};
    return {
        minimum_lead_hours: toPositiveNumber(
            feasibility.minimum_lead_hours,
            DEFAULT_FEASIBILITY_CONFIG.minimum_lead_hours
        ),
        exclude_weekends:
            typeof feasibility.exclude_weekends === "boolean"
                ? feasibility.exclude_weekends
                : DEFAULT_FEASIBILITY_CONFIG.exclude_weekends,
        weekend_days: resolveWeekendDays(feasibility.weekend_days),
        timezone:
            typeof feasibility.timezone === "string" && feasibility.timezone.trim().length > 0
                ? feasibility.timezone.trim()
                : DEFAULT_FEASIBILITY_CONFIG.timezone,
    };
};

const resolveCompanyLeadTimeOverride = (settings: unknown): number | null => {
    const feasibility = (settings as any)?.feasibility || {};
    if (feasibility.minimum_lead_hours === undefined || feasibility.minimum_lead_hours === null) {
        return null;
    }
    return toPositiveNumber(
        feasibility.minimum_lead_hours,
        DEFAULT_FEASIBILITY_CONFIG.minimum_lead_hours
    );
};

const getWeekdayInTimezone = (date: Date, timezone: string): number => {
    const shortName = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
    }).format(date);
    return WEEKDAY_MAP[shortName] ?? date.getDay();
};

const isWeekend = (date: Date, config: FeasibilityConfig): boolean => {
    if (!config.exclude_weekends) return false;
    const weekday = getWeekdayInTimezone(date, config.timezone);
    return config.weekend_days.includes(weekday);
};

const addBusinessDays = (startDate: Date, days: number, config: FeasibilityConfig): Date => {
    if (days <= 0) return new Date(startDate);
    const result = new Date(startDate);
    let added = 0;
    while (added < days) {
        result.setDate(result.getDate() + 1);
        if (!isWeekend(result, config)) added++;
    }
    return result;
};

const advanceToNextBusinessDay = (date: Date, config: FeasibilityConfig): Date => {
    const result = new Date(date);
    while (isWeekend(result, config)) {
        result.setDate(result.getDate() + 1);
    }
    return result;
};

const computeLeadFloorDate = (config: FeasibilityConfig): string => {
    const leadWindowStart = new Date(Date.now() + config.minimum_lead_hours * 60 * 60 * 1000);
    const floorDate = advanceToNextBusinessDay(leadWindowStart, config);
    return formatDateInTimezone(floorDate, config.timezone);
};

const computeLeadFloorDatetime = (config: FeasibilityConfig): string => {
    const leadWindowStart = new Date(Date.now() + config.minimum_lead_hours * 60 * 60 * 1000);
    const floorDate = advanceToNextBusinessDay(leadWindowStart, config);
    return floorDate.toISOString();
};

const formatDateInTimezone = (date: Date, timezone: string): string =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);

export const getPlatformFeasibilityConfig = async (
    platformId: string,
    companyId?: string | null
): Promise<FeasibilityConfig> => {
    const [platformRows, companyRows] = await Promise.all([
        db
            .select({ config: platforms.config })
            .from(platforms)
            .where(eq(platforms.id, platformId))
            .limit(1),
        companyId
            ? db
                  .select({ settings: companies.settings })
                  .from(companies)
                  .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)))
                  .limit(1)
            : Promise.resolve([] as Array<{ settings: unknown }>),
    ]);
    const platform = platformRows[0];

    if (!platform) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Platform not found");
    }

    const resolved = resolveFeasibilityConfig(platform.config);
    const override = companyRows[0]
        ? resolveCompanyLeadTimeOverride(companyRows[0].settings)
        : null;
    if (override !== null) {
        resolved.minimum_lead_hours = override;
    }
    return resolved;
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
        const cfg = await getPlatformFeasibilityConfig(platformId, companyId);
        return {
            feasible: true,
            config: cfg,
            issues: [],
            lead_floor_date: computeLeadFloorDate(cfg),
            lead_floor_datetime: computeLeadFloorDatetime(cfg),
        };
    }

    const config = await getPlatformFeasibilityConfig(platformId, companyId);

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
