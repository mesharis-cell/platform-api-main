import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { accessPolicies, platforms, users } from "../../../db/schema";
import config from "../../config";
import { DEFAULT_ACCESS_POLICIES, DEFAULT_ACCESS_POLICY_CODES } from "../../utils/access-policy";
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
        enable_base_operations:
            raw.enable_base_operations === undefined ? true : Boolean(raw.enable_base_operations),
        enable_asset_bulk_upload:
            raw.enable_asset_bulk_upload === undefined
                ? false
                : Boolean(raw.enable_asset_bulk_upload),
        enable_attachments:
            raw.enable_attachments === undefined ? true : Boolean(raw.enable_attachments),
        enable_workflows: raw.enable_workflows === undefined ? true : Boolean(raw.enable_workflows),
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
    if (raw.enable_base_operations !== undefined) {
        patch.enable_base_operations = Boolean(raw.enable_base_operations);
    }
    if (raw.enable_asset_bulk_upload !== undefined) {
        patch.enable_asset_bulk_upload = Boolean(raw.enable_asset_bulk_upload);
    }
    if (raw.enable_attachments !== undefined) {
        patch.enable_attachments = Boolean(raw.enable_attachments);
    }
    if (raw.enable_workflows !== undefined) {
        patch.enable_workflows = Boolean(raw.enable_workflows);
    }

    return patch;
};

// ----------------------------------- CREATE PLATFORM --------------------------------
const createPlatform = async (data: CreatePlatformPayload) => {
    const vatPercent = sanitizeVatPercent(
        (data.config as Record<string, unknown> | undefined)?.vat_percent
    );
    const configWithoutVat = sanitizePlatformConfig(data.config);
    const result = await db.transaction(async (tx) => {
        const [platform] = await tx
            .insert(platforms)
            .values({
                ...data,
                config: configWithoutVat,
                vat_percent: vatPercent.toFixed(2),
            })
            .returning();

        if (platform?.id) {
            const hashedPassword = await bcrypt.hash(
                config.system_user_password,
                config.salt_rounds
            );
            await tx.insert(accessPolicies).values(
                DEFAULT_ACCESS_POLICIES.map((policy) => ({
                    platform_id: platform.id,
                    code: policy.code,
                    role: policy.role,
                    name: policy.name,
                    description: policy.description,
                    permissions: policy.permissions,
                }))
            );

            const [adminPolicy] = await tx
                .select({ id: accessPolicies.id })
                .from(accessPolicies)
                .where(
                    and(
                        eq(accessPolicies.platform_id, platform.id),
                        eq(accessPolicies.code, DEFAULT_ACCESS_POLICY_CODES.ADMIN)
                    )
                )
                .limit(1);

            await tx.insert(users).values({
                platform_id: platform.id,
                name: "System User",
                email: config.system_user_email,
                password: hashedPassword,
                role: "ADMIN",
                permissions: [],
                access_policy_id: adminPolicy?.id ?? null,
            });
        }

        return platform;
    });

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
