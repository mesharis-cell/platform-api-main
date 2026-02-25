import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { companies, companyDomains, platforms } from "../../db/schema";

export type AppTarget = "ADMIN" | "WAREHOUSE" | "CLIENT";
export type DeepLinkEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "SELF_BOOKING";

type ResolveEntityDeepLinkInput = {
    platformId: string;
    companyId?: string | null;
    app: AppTarget;
    entityType: DeepLinkEntityType;
    entityId: string;
};

const normalizeHost = (value: string): string => {
    const trimmed = String(value || "")
        .trim()
        .toLowerCase();
    if (!trimmed) return "";

    const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    try {
        return new URL(candidate).hostname.toLowerCase();
    } catch {
        return trimmed
            .replace(/^https?:\/\//, "")
            .split("/")[0]
            .split(":")[0]
            .toLowerCase();
    }
};

const asHttps = (hostname: string) => `https://${normalizeHost(hostname)}`;

const entityRouteMap: Record<
    AppTarget,
    Partial<Record<DeepLinkEntityType, (id: string) => string>>
> = {
    ADMIN: {
        ORDER: (id) => `/orders/${id}`,
        INBOUND_REQUEST: (id) => `/inbound-request/${id}`,
        SERVICE_REQUEST: (id) => `/service-requests/${id}`,
        SELF_BOOKING: (id) => `/self-bookings/${id}`,
    },
    WAREHOUSE: {
        ORDER: (id) => `/orders/${id}`,
        INBOUND_REQUEST: (id) => `/inbound-request/${id}`,
        SERVICE_REQUEST: (id) => `/service-requests/${id}`,
    },
    CLIENT: {
        ORDER: (id) => `/orders/${id}`,
        INBOUND_REQUEST: (id) => `/assets-inbound/${id}`,
        SERVICE_REQUEST: (id) => `/service-requests/${id}`,
    },
};

const getPlatformDomain = async (platformId: string): Promise<string> => {
    const [platform] = await db
        .select({ domain: platforms.domain })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    return normalizeHost(platform?.domain || "");
};

const resolveCompanyPrimaryDomain = async (
    platformId: string,
    companyId: string
): Promise<string | null> => {
    const [domain] = await db
        .select({ hostname: companyDomains.hostname })
        .from(companyDomains)
        .where(
            and(
                eq(companyDomains.platform_id, platformId),
                eq(companyDomains.company_id, companyId),
                eq(companyDomains.is_active, true),
                eq(companyDomains.is_primary, true)
            )
        )
        .limit(1);

    return domain?.hostname ? normalizeHost(domain.hostname) : null;
};

const getPlatformAppBaseUrls = async (platformId: string) => {
    const platformDomain = await getPlatformDomain(platformId);
    if (!platformDomain) {
        throw new Error("Platform domain is missing");
    }

    return {
        platform_domain: platformDomain,
        admin_url: asHttps(`admin.${platformDomain}`),
        warehouse_url: asHttps(`warehouse.${platformDomain}`),
    };
};

const resolveClientBaseUrl = async (
    platformId: string,
    companyId?: string | null
): Promise<string> => {
    if (!companyId) {
        throw new Error("Company id is required to resolve client URL");
    }

    const domain = await resolveCompanyPrimaryDomain(platformId, companyId);
    if (!domain) {
        throw new Error(`No active primary company domain configured for company ${companyId}`);
    }

    return asHttps(domain);
};

const resolveEntityDeepLink = async (
    params: ResolveEntityDeepLinkInput
): Promise<string | null> => {
    const { platformId, companyId, app, entityType, entityId } = params;
    const routeBuilder = entityRouteMap[app]?.[entityType];
    if (!routeBuilder) return null;

    let baseUrl: string;
    if (app === "CLIENT") {
        baseUrl = await resolveClientBaseUrl(platformId, companyId);
    } else {
        const platformUrls = await getPlatformAppBaseUrls(platformId);
        baseUrl = app === "ADMIN" ? platformUrls.admin_url : platformUrls.warehouse_url;
    }

    return `${baseUrl}${routeBuilder(entityId)}`;
};

const getPlatformUrlDiagnostics = async (platformId: string) => {
    const baseUrls = await getPlatformAppBaseUrls(platformId);

    const rows = await db
        .select({
            company_id: companies.id,
            company_name: companies.name,
            primary_domain: companyDomains.hostname,
        })
        .from(companies)
        .leftJoin(
            companyDomains,
            and(
                eq(companyDomains.company_id, companies.id),
                eq(companyDomains.platform_id, platformId),
                eq(companyDomains.is_active, true),
                eq(companyDomains.is_primary, true)
            )
        )
        .where(and(eq(companies.platform_id, platformId), isNull(companies.deleted_at)));

    const company_urls = rows.map((row) => {
        const host = row.primary_domain ? normalizeHost(row.primary_domain) : null;
        return {
            company_id: row.company_id,
            company_name: row.company_name,
            client_url: host ? asHttps(host) : null,
            status: host ? "OK" : "MISSING_PRIMARY_DOMAIN",
        };
    });

    return {
        ...baseUrls,
        company_urls,
    };
};

export const UrlResolverService = {
    getPlatformDomain,
    getPlatformAppBaseUrls,
    resolveClientBaseUrl,
    resolveCompanyPrimaryDomain,
    resolveEntityDeepLink,
    getPlatformUrlDiagnostics,
};
