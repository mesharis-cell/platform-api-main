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

import { and, eq, inArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, platforms, warehouses } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";

export type FeasibilityEntityType = "ORDER" | "SELF_PICKUP";

// Weekly operating-hours map. Each weekday is either a [open, close] tuple
// of integer hours (0-24) interpreted in the platform timezone, or null
// meaning the warehouse is closed that day. `null` on the whole map = no
// schedule enforced (treated as "always open" for backward compatibility).
export type DayHours = [number, number];
export type OperatingHours = {
    mon?: DayHours | null;
    tue?: DayHours | null;
    wed?: DayHours | null;
    thu?: DayHours | null;
    fri?: DayHours | null;
    sat?: DayHours | null;
    sun?: DayHours | null;
};

export type FeasibilityConfig = {
    minimum_lead_hours: number;
    /**
     * Lead-time floor for self-pickup submissions. Defaults lower than order
     * lead time because self-pickup is a same-day / next-day convenience —
     * the client brings their own vehicle and doesn't wait on our logistics
     * window. Overridable per-platform, per-company, and per-warehouse.
     */
    sp_minimum_lead_hours: number;
    /**
     * Lead-time floor for OUT-OF-HOURS self-pickup windows — pickups
     * requested outside the warehouse's operating_hours need more notice
     * so ops can staff the unusual window. Defaults to 12h. Falls back to
     * sp_minimum_lead_hours when no operating_hours are set.
     */
    ooh_pickup_minimum_lead_hours: number;
    exclude_weekends: boolean;
    weekend_days: number[];
    timezone: string;
    /**
     * Operating hours by weekday — null = no schedule (treated as "always
     * open" for backward compatibility). Resolution mirrors lead hours:
     * company override -> warehouse default -> platform -> null.
     */
    operating_hours: OperatingHours | null;
};

export const DEFAULT_FEASIBILITY_CONFIG: FeasibilityConfig = {
    minimum_lead_hours: 24,
    sp_minimum_lead_hours: 2,
    ooh_pickup_minimum_lead_hours: 12,
    exclude_weekends: true,
    weekend_days: [0, 6],
    timezone: "Asia/Dubai",
    operating_hours: null,
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

const sanitizeOperatingHours = (raw: unknown): OperatingHours | null => {
    if (!raw || typeof raw !== "object") return null;
    const keys: Array<keyof OperatingHours> = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const out: OperatingHours = {};
    let hasAnyKey = false;
    for (const k of keys) {
        const v = (raw as any)[k];
        if (v === null || v === undefined) {
            out[k] = null;
            continue;
        }
        if (
            Array.isArray(v) &&
            v.length === 2 &&
            Number.isFinite(Number(v[0])) &&
            Number.isFinite(Number(v[1]))
        ) {
            const open = Math.max(0, Math.min(24, Number(v[0])));
            const close = Math.max(0, Math.min(24, Number(v[1])));
            if (close > open) {
                out[k] = [open, close];
                hasAnyKey = true;
                continue;
            }
        }
        out[k] = null;
    }
    return hasAnyKey ? out : null;
};

export const resolveFeasibilityConfig = (config: unknown): FeasibilityConfig => {
    const feasibility = (config as any)?.feasibility || {};
    return {
        minimum_lead_hours: toPositiveNumber(
            feasibility.minimum_lead_hours,
            DEFAULT_FEASIBILITY_CONFIG.minimum_lead_hours
        ),
        sp_minimum_lead_hours: toPositiveNumber(
            feasibility.sp_minimum_lead_hours,
            DEFAULT_FEASIBILITY_CONFIG.sp_minimum_lead_hours
        ),
        ooh_pickup_minimum_lead_hours: toPositiveNumber(
            feasibility.ooh_pickup_minimum_lead_hours,
            DEFAULT_FEASIBILITY_CONFIG.ooh_pickup_minimum_lead_hours
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
        operating_hours: sanitizeOperatingHours(feasibility.operating_hours),
    };
};

type LeadHoursKey =
    | "minimum_lead_hours"
    | "sp_minimum_lead_hours"
    | "ooh_pickup_minimum_lead_hours";

const resolveCompanyLeadTimeOverride = (settings: unknown, key: LeadHoursKey): number | null => {
    const feasibility = (settings as any)?.feasibility || {};
    const raw = feasibility[key];
    if (raw === undefined || raw === null) return null;
    return toPositiveNumber(raw, DEFAULT_FEASIBILITY_CONFIG[key]);
};

const resolveCompanyOperatingHoursOverride = (settings: unknown): OperatingHours | null => {
    const feasibility = (settings as any)?.feasibility || {};
    return sanitizeOperatingHours(feasibility.operating_hours);
};

const resolveWarehouseLeadHours = (
    warehouseConfig: unknown,
    key: LeadHoursKey
): number | null => {
    if (!warehouseConfig || typeof warehouseConfig !== "object") return null;
    const raw = (warehouseConfig as any)[key];
    if (raw === undefined || raw === null) return null;
    return toPositiveNumber(raw, DEFAULT_FEASIBILITY_CONFIG[key]);
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

export const addBusinessDays = (startDate: Date, days: number, config: FeasibilityConfig): Date => {
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

// Strictest-wins intersection of weekly operating-hours maps across N
// warehouses. For each day, the intersection is the latest open time and
// earliest close time across all open warehouses; if ANY warehouse is
// closed that day, the intersection is closed (null).
const intersectOperatingHours = (
    maps: Array<OperatingHours | null>
): OperatingHours | null => {
    const nonNull = maps.filter((m): m is OperatingHours => m !== null);
    if (nonNull.length === 0) return null;
    const keys: Array<keyof OperatingHours> = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const out: OperatingHours = {};
    let hasAnyOpen = false;
    for (const k of keys) {
        const dayWindows: DayHours[] = [];
        let anyClosed = false;
        for (const m of nonNull) {
            const w = m[k];
            if (w === null || w === undefined) {
                anyClosed = true;
                break;
            }
            dayWindows.push(w);
        }
        if (anyClosed || dayWindows.length === 0) {
            out[k] = null;
            continue;
        }
        const latestOpen = Math.max(...dayWindows.map(([o]) => o));
        const earliestClose = Math.min(...dayWindows.map(([, c]) => c));
        if (earliestClose > latestOpen) {
            out[k] = [latestOpen, earliestClose];
            hasAnyOpen = true;
        } else {
            out[k] = null;
        }
    }
    return hasAnyOpen ? out : null;
};

/**
 * Resolve the effective feasibility config for an entity-submit context.
 *
 * Resolution order per field is:
 *   company.settings.feasibility.<field>
 *     -> warehouse.config.<field>  (strictest across all warehouseIds)
 *     -> platform.config.feasibility.<field>
 *     -> hardcoded default
 *
 * Strictest-wins applies when more than one warehouse is involved:
 *   - lead hours: max() across warehouses
 *   - operating_hours: per-day intersection (all open AND overlap)
 *
 * Backward-compat: when called as
 * `getPlatformFeasibilityConfig(platformId, companyId)`, the resolver is
 * equivalent to the old two-arg signature (warehouseIds=[] → no
 * warehouse-level override).
 */
export const getPlatformFeasibilityConfig = async (
    platformId: string,
    companyId?: string | null,
    warehouseIds: string[] = []
): Promise<FeasibilityConfig> => {
    const uniqueWarehouseIds = Array.from(
        new Set(warehouseIds.filter((id): id is string => Boolean(id)))
    );
    const [platformRows, companyRows, warehouseRows] = await Promise.all([
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
        uniqueWarehouseIds.length > 0
            ? db
                  .select({
                      id: warehouses.id,
                      config: warehouses.config,
                      operating_hours: warehouses.operating_hours,
                  })
                  .from(warehouses)
                  .where(
                      and(
                          inArray(warehouses.id, uniqueWarehouseIds),
                          eq(warehouses.platform_id, platformId)
                      )
                  )
            : Promise.resolve(
                  [] as Array<{ id: string; config: unknown; operating_hours: unknown }>
              ),
    ]);
    const platform = platformRows[0];

    if (!platform) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Platform not found");
    }

    const resolved = resolveFeasibilityConfig(platform.config);

    // Apply warehouse-level overrides FIRST (strictest across all involved
    // warehouses), then company-level override wins on top. This means a
    // company override applies uniformly across every warehouse it touches,
    // matching the v1 per-client policy.
    const leadKeys: LeadHoursKey[] = [
        "minimum_lead_hours",
        "sp_minimum_lead_hours",
        "ooh_pickup_minimum_lead_hours",
    ];

    if (warehouseRows.length > 0) {
        for (const key of leadKeys) {
            const perWarehouse = warehouseRows
                .map((w) => resolveWarehouseLeadHours(w.config, key))
                .filter((v): v is number => v !== null);
            if (perWarehouse.length > 0) {
                resolved[key] = Math.max(resolved[key], ...perWarehouse);
            }
        }
        const whHoursMaps = warehouseRows.map((w) => sanitizeOperatingHours(w.operating_hours));
        const anyWarehouseSchedule = whHoursMaps.some((m) => m !== null);
        if (anyWarehouseSchedule) {
            resolved.operating_hours = intersectOperatingHours(whHoursMaps);
        }
    }

    if (companyRows[0]) {
        for (const key of leadKeys) {
            const companyOverride = resolveCompanyLeadTimeOverride(
                companyRows[0].settings,
                key
            );
            if (companyOverride !== null) {
                // Company override REPLACES the resolved value rather than
                // taking max — the per-client SLA is authoritative for that
                // tenant even if it's looser than the warehouse default.
                resolved[key] = companyOverride;
            }
        }
        const companyHours = resolveCompanyOperatingHoursOverride(companyRows[0].settings);
        if (companyHours !== null) {
            resolved.operating_hours = companyHours;
        }
    }
    return resolved;
};

// Backwards-compat alias for callers that want the explicit name.
export const resolveFeasibility = getPlatformFeasibilityConfig;

/**
 * Pick the lead hours for a given entity type. Orders use the longer
 * `minimum_lead_hours` (logistics needs prep time to dispatch trucks and
 * crews); self-pickups use `sp_minimum_lead_hours` (the client handles
 * their own logistics, so all we need is warehouse pick-pack time).
 */
export const leadHoursForEntity = (
    config: FeasibilityConfig,
    entityType: FeasibilityEntityType
): number =>
    entityType === "SELF_PICKUP" ? config.sp_minimum_lead_hours : config.minimum_lead_hours;

/**
 * Compute the earliest feasible datetime for a given entity type. Mirrors
 * `computeLeadFloorDatetime` but takes an explicit entity-type param so
 * self-pickup submit can check against sp_minimum_lead_hours without
 * duplicating the business-day math.
 */
export const computeLeadFloorDatetimeForEntity = (
    config: FeasibilityConfig,
    entityType: FeasibilityEntityType
): string => {
    const leadHours = leadHoursForEntity(config, entityType);
    const leadWindowStart = new Date(Date.now() + leadHours * 60 * 60 * 1000);
    const floorDate = advanceToNextBusinessDay(leadWindowStart, config);
    return floorDate.toISOString();
};

// Maps a JS Date to a weekday-key in the platform timezone.
const WEEKDAY_KEYS: Array<keyof OperatingHours> = [
    "sun",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
];

/**
 * Extract the hour (0-23) of a Date in a given timezone using Intl. Never
 * relies on server-local time — the platform timezone is the source of
 * truth for operating-hour comparisons.
 */
const getHourInTimezone = (date: Date, timezone: string): number => {
    const formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hour12: false,
    }).format(date);
    // formatted is "HH" (or sometimes "24" which we normalize to 0).
    const hour = parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour % 24 : 0;
};

/**
 * Check whether a given Date falls inside the operating-hours window for
 * its weekday in the platform timezone. Returns `true` when there's no
 * schedule (operating_hours=null) or when the day's window is open and
 * contains the moment.
 */
export const isWithinOperatingHours = (date: Date, config: FeasibilityConfig): boolean => {
    if (!config.operating_hours) return true;
    const weekdayIdx = getWeekdayInTimezone(date, config.timezone);
    const dayKey = WEEKDAY_KEYS[weekdayIdx];
    const window = config.operating_hours[dayKey];
    if (!window) return false; // null = closed that day
    const [open, close] = window;
    const hour = getHourInTimezone(date, config.timezone);
    return hour >= open && hour < close;
};

/**
 * Pick the right lead-hours floor for a self-pickup request. When the
 * requested window starts OUTSIDE the warehouse's operating hours, apply
 * the longer `ooh_pickup_minimum_lead_hours` instead of the default
 * `sp_minimum_lead_hours`. Falls back to the standard SP lead when no
 * operating_hours are configured.
 */
export const spLeadHoursForWindow = (
    config: FeasibilityConfig,
    requestedStart: Date
): number => {
    if (!config.operating_hours) return config.sp_minimum_lead_hours;
    return isWithinOperatingHours(requestedStart, config)
        ? config.sp_minimum_lead_hours
        : config.ooh_pickup_minimum_lead_hours;
};
