import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { platforms } from "../../../db/schema";
import { CreatePlatformPayload } from "./platform.interfaces";
import { UrlResolverService } from "../../services/url-resolver.service";
import { companyFeatures, featureNames } from "../../constants/common";

const FEATURE_KEYS = Object.values(featureNames);

const sanitizePlatformConfig = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    const feasibility =
        raw.feasibility && typeof raw.feasibility === "object"
            ? (raw.feasibility as Record<string, unknown>)
            : undefined;

    return {
        logo_url: typeof raw.logo_url === "string" ? raw.logo_url : undefined,
        primary_color: typeof raw.primary_color === "string" ? raw.primary_color : undefined,
        secondary_color: typeof raw.secondary_color === "string" ? raw.secondary_color : undefined,
        from_email: typeof raw.from_email === "string" ? raw.from_email : undefined,
        support_email: typeof raw.support_email === "string" ? raw.support_email : undefined,
        currency: typeof raw.currency === "string" ? raw.currency : undefined,
        feasibility: feasibility
            ? {
                  minimum_lead_hours:
                      typeof feasibility.minimum_lead_hours === "number"
                          ? feasibility.minimum_lead_hours
                          : undefined,
                  exclude_weekends:
                      typeof feasibility.exclude_weekends === "boolean"
                          ? feasibility.exclude_weekends
                          : undefined,
                  weekend_days: Array.isArray(feasibility.weekend_days)
                      ? feasibility.weekend_days
                            .map((day) => Number(day))
                            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
                      : undefined,
                  timezone:
                      typeof feasibility.timezone === "string" ? feasibility.timezone : undefined,
              }
            : undefined,
    };
};

const sanitizeVatPercent = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, parsed));
};

const sanitizePlatformConfigPatch = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (raw.logo_url !== undefined) patch.logo_url = raw.logo_url;
    if (raw.primary_color !== undefined) patch.primary_color = raw.primary_color;
    if (raw.secondary_color !== undefined) patch.secondary_color = raw.secondary_color;
    if (raw.from_email !== undefined) patch.from_email = raw.from_email;
    if (raw.support_email !== undefined) patch.support_email = raw.support_email;
    if (raw.currency !== undefined) patch.currency = raw.currency;
    if (raw.feasibility !== undefined)
        patch.feasibility = sanitizePlatformConfig({ feasibility: raw.feasibility }).feasibility;

    return patch;
};

// Both sanitizers iterate the central featureNames registry so adding a new
// flag to constants/common.ts automatically flows through. Do NOT hand-code
// feature lists here — see CLAUDE.md <feature_flag_discipline>.
const sanitizePlatformFeatures = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    return FEATURE_KEYS.reduce<Record<string, boolean>>((acc, key) => {
        acc[key] =
            raw[key] === undefined
                ? Boolean(companyFeatures[key as keyof typeof companyFeatures])
                : Boolean(raw[key]);
        return acc;
    }, {});
};

const sanitizePlatformFeaturesPatch = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    return FEATURE_KEYS.reduce<Record<string, boolean>>((acc, key) => {
        if (raw[key] !== undefined) {
            acc[key] = Boolean(raw[key]);
        }
        return acc;
    }, {});
};

// ----------------------------------- CREATE PLATFORM --------------------------------
const createPlatform = async (data: CreatePlatformPayload) => {
    const vatPercent = sanitizeVatPercent(
        (data.config as Record<string, unknown> | undefined)?.vat_percent
    );
    const configWithoutVat = sanitizePlatformConfig(data.config);
    const [result] = await db
        .insert(platforms)
        .values({
            ...data,
            config: configWithoutVat,
            vat_percent: vatPercent.toFixed(2),
        })
        .returning();

    return {
        ...result,
        config: sanitizePlatformConfig(result.config),
        features: sanitizePlatformFeatures(result.features),
        vat_percent: sanitizeVatPercent(result.vat_percent),
    };
};

const getPlatform = async (platformId: string) => {
    const [platform] = await db.select().from(platforms).where(eq(platforms.id, platformId));
    if (!platform) return null;
    return {
        ...platform,
        config: sanitizePlatformConfig(platform.config),
        features: sanitizePlatformFeatures(platform.features),
        vat_percent: sanitizeVatPercent(platform.vat_percent),
    };
};

const updatePlatformConfig = async (platformId: string, patch: Record<string, unknown>) => {
    const [existing] = await db
        .select({ config: platforms.config, vat_percent: platforms.vat_percent })
        .from(platforms)
        .where(eq(platforms.id, platformId));
    const merged = {
        ...sanitizePlatformConfig(existing?.config),
        ...sanitizePlatformConfigPatch(patch),
    };
    const vatPercent =
        patch.vat_percent === undefined
            ? sanitizeVatPercent(existing?.vat_percent)
            : sanitizeVatPercent(patch.vat_percent);
    const [updated] = await db
        .update(platforms)
        .set({
            config: merged,
            vat_percent: vatPercent.toFixed(2),
        })
        .where(eq(platforms.id, platformId))
        .returning();
    return {
        ...updated,
        config: sanitizePlatformConfig(updated.config),
        features: sanitizePlatformFeatures(updated.features),
        vat_percent: sanitizeVatPercent(updated.vat_percent),
    };
};

const updatePlatformFeatures = async (platformId: string, patch: Record<string, boolean>) => {
    const [existing] = await db
        .select({ features: platforms.features })
        .from(platforms)
        .where(eq(platforms.id, platformId));
    const merged = {
        ...sanitizePlatformFeatures(existing?.features),
        ...sanitizePlatformFeaturesPatch(patch),
    };
    const [updated] = await db
        .update(platforms)
        .set({ features: merged })
        .where(eq(platforms.id, platformId))
        .returning();
    return {
        ...updated,
        config: sanitizePlatformConfig(updated.config),
        features: sanitizePlatformFeatures(updated.features),
        vat_percent: sanitizeVatPercent(updated.vat_percent),
    };
};

const updatePlatformDomain = async (platformId: string, domain: string) => {
    const [updated] = await db
        .update(platforms)
        .set({ domain })
        .where(eq(platforms.id, platformId))
        .returning();
    return updated;
};

const getPlatformUrlDiagnostics = async (platformId: string) => {
    return UrlResolverService.getPlatformUrlDiagnostics(platformId);
};

export const PlatformServices = {
    createPlatform,
    getPlatform,
    updatePlatformConfig,
    updatePlatformFeatures,
    updatePlatformDomain,
    getPlatformUrlDiagnostics,
};
