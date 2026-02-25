import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { platforms, users } from "../../../db/schema";
import config from "../../config";
import { permissionChecker } from "../../utils/checker";
import { CreatePlatformPayload } from "./platform.interfaces";
import bcrypt from "bcrypt";
import { UrlResolverService } from "../../services/url-resolver.service";

const sanitizePlatformConfig = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    return {
        logo_url: typeof raw.logo_url === "string" ? raw.logo_url : undefined,
        primary_color: typeof raw.primary_color === "string" ? raw.primary_color : undefined,
        secondary_color: typeof raw.secondary_color === "string" ? raw.secondary_color : undefined,
        from_email: typeof raw.from_email === "string" ? raw.from_email : undefined,
        currency: typeof raw.currency === "string" ? raw.currency : undefined,
    };
};

const sanitizePlatformConfigPatch = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (raw.logo_url !== undefined) patch.logo_url = raw.logo_url;
    if (raw.primary_color !== undefined) patch.primary_color = raw.primary_color;
    if (raw.secondary_color !== undefined) patch.secondary_color = raw.secondary_color;
    if (raw.from_email !== undefined) patch.from_email = raw.from_email;
    if (raw.currency !== undefined) patch.currency = raw.currency;

    return patch;
};

const sanitizePlatformFeatures = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    return {
        enable_inbound_requests:
            raw.enable_inbound_requests === undefined ? true : Boolean(raw.enable_inbound_requests),
        show_estimate_on_order_creation:
            raw.show_estimate_on_order_creation === undefined
                ? true
                : Boolean(raw.show_estimate_on_order_creation),
        enable_kadence_invoicing:
            raw.enable_kadence_invoicing === undefined
                ? false
                : Boolean(raw.enable_kadence_invoicing),
    };
};

const sanitizePlatformFeaturesPatch = (value: unknown) => {
    const raw = (value || {}) as Record<string, unknown>;
    const patch: Record<string, boolean> = {};

    if (raw.enable_inbound_requests !== undefined) {
        patch.enable_inbound_requests = Boolean(raw.enable_inbound_requests);
    }
    if (raw.show_estimate_on_order_creation !== undefined) {
        patch.show_estimate_on_order_creation = Boolean(raw.show_estimate_on_order_creation);
    }
    if (raw.enable_kadence_invoicing !== undefined) {
        patch.enable_kadence_invoicing = Boolean(raw.enable_kadence_invoicing);
    }

    return patch;
};

// ----------------------------------- CREATE PLATFORM --------------------------------
const createPlatform = async (data: CreatePlatformPayload) => {
    const result = await db.transaction(async (tx) => {
        const [platform] = await tx.insert(platforms).values(data).returning();

        if (platform?.id) {
            const hashedPassword = await bcrypt.hash(
                config.system_user_password,
                config.salt_rounds
            );

            const permissions = permissionChecker("ADMIN", undefined, "PLATFORM_ADMIN");

            await tx.insert(users).values({
                platform_id: platform.id,
                name: "System User",
                email: config.system_user_email,
                password: hashedPassword,
                role: "ADMIN",
                permissions,
                permission_template: "PLATFORM_ADMIN",
            });
        }

        return platform;
    });

    return result;
};

const getPlatform = async (platformId: string) => {
    const [platform] = await db.select().from(platforms).where(eq(platforms.id, platformId));
    if (!platform) return null;
    return {
        ...platform,
        config: sanitizePlatformConfig(platform.config),
        features: sanitizePlatformFeatures(platform.features),
    };
};

const updatePlatformConfig = async (platformId: string, patch: Record<string, unknown>) => {
    const [existing] = await db
        .select({ config: platforms.config })
        .from(platforms)
        .where(eq(platforms.id, platformId));
    const merged = {
        ...sanitizePlatformConfig(existing?.config),
        ...sanitizePlatformConfigPatch(patch),
    };
    const [updated] = await db
        .update(platforms)
        .set({ config: merged })
        .where(eq(platforms.id, platformId))
        .returning();
    return {
        ...updated,
        config: sanitizePlatformConfig(updated.config),
        features: sanitizePlatformFeatures(updated.features),
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
