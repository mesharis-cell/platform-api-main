/**
 * Shared feasibility primitives — timezone-aware date math, platform config
 * resolution, and lead-floor computation.
 *
 * Previously private to `order-feasibility.utils.ts`. Extracted so other
 * entity types (self-pickup, inbound, service-request) can consume the same
 * timezone-aware business-day math without pulling in order-specific types.
 *
 * Nothing in this file knows about orders. The order-specific validator +
 * per-asset issue-building logic stays in `order-feasibility.utils.ts`.
 */

import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, platforms } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";

export type FeasibilityConfig = {
    minimum_lead_hours: number;
    exclude_weekends: boolean;
    weekend_days: number[];
    timezone: string;
};

export const DEFAULT_FEASIBILITY_CONFIG: FeasibilityConfig = {
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

export const resolveFeasibilityConfig = (config: unknown): FeasibilityConfig => {
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

export const getWeekdayInTimezone = (date: Date, timezone: string): number => {
    const shortName = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
    }).format(date);
    return WEEKDAY_MAP[shortName] ?? date.getDay();
};

export const isWeekend = (date: Date, config: FeasibilityConfig): boolean => {
    if (!config.exclude_weekends) return false;
    const weekday = getWeekdayInTimezone(date, config.timezone);
    return config.weekend_days.includes(weekday);
};

export const addBusinessDays = (
    startDate: Date,
    days: number,
    config: FeasibilityConfig
): Date => {
    if (days <= 0) return new Date(startDate);
    const result = new Date(startDate);
    let added = 0;
    while (added < days) {
        result.setDate(result.getDate() + 1);
        if (!isWeekend(result, config)) added++;
    }
    return result;
};

export const advanceToNextBusinessDay = (date: Date, config: FeasibilityConfig): Date => {
    const result = new Date(date);
    while (isWeekend(result, config)) {
        result.setDate(result.getDate() + 1);
    }
    return result;
};

export const formatDateInTimezone = (date: Date, timezone: string): string =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);

export const computeLeadFloorDate = (config: FeasibilityConfig): string => {
    const leadWindowStart = new Date(Date.now() + config.minimum_lead_hours * 60 * 60 * 1000);
    const floorDate = advanceToNextBusinessDay(leadWindowStart, config);
    return formatDateInTimezone(floorDate, config.timezone);
};

export const computeLeadFloorDatetime = (config: FeasibilityConfig): string => {
    const leadWindowStart = new Date(Date.now() + config.minimum_lead_hours * 60 * 60 * 1000);
    const floorDate = advanceToNextBusinessDay(leadWindowStart, config);
    return floorDate.toISOString();
};

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
