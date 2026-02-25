import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../../../db";
import { companyDomains, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";

const normalizeHostname = (hostname: string) =>
    hostname
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        .split(":")[0];

const findReplacementPrimary = async (
    tx: any,
    platformId: string,
    companyId: string,
    excludedDomainId: string
) => {
    const [replacement] = await tx
        .select({ id: companyDomains.id })
        .from(companyDomains)
        .where(
            and(
                eq(companyDomains.platform_id, platformId),
                eq(companyDomains.company_id, companyId),
                eq(companyDomains.is_active, true),
                ne(companyDomains.id, excludedDomainId)
            )
        )
        .orderBy(asc(companyDomains.created_at))
        .limit(1);

    return replacement?.id ?? null;
};

const listCompanyDomains = async (platformId: string) => {
    const rows = await db
        .select({
            id: companyDomains.id,
            platform_id: companyDomains.platform_id,
            company_id: companyDomains.company_id,
            company_name: companies.name,
            hostname: companyDomains.hostname,
            type: companyDomains.type,
            is_verified: companyDomains.is_verified,
            is_active: companyDomains.is_active,
            is_primary: companyDomains.is_primary,
            created_at: companyDomains.created_at,
            updated_at: companyDomains.updated_at,
        })
        .from(companyDomains)
        .innerJoin(companies, eq(companyDomains.company_id, companies.id))
        .where(eq(companyDomains.platform_id, platformId));
    return rows;
};

const createCompanyDomain = async (
    platformId: string,
    data: {
        company_id: string;
        hostname: string;
        type: "VANITY" | "CUSTOM";
        is_verified?: boolean;
        is_active?: boolean;
        is_primary?: boolean;
    }
) => {
    const normalizedHostname = normalizeHostname(data.hostname);
    const isActive = data.is_active ?? true;
    const isPrimary = data.is_primary ?? false;

    if (isPrimary && !isActive) {
        throw new CustomizedError(400, "Primary domain must be active");
    }

    return db.transaction(async (tx) => {
        const [existing] = await tx
            .select({ id: companyDomains.id })
            .from(companyDomains)
            .where(eq(companyDomains.hostname, normalizedHostname))
            .limit(1);

        if (existing) throw new CustomizedError(409, "Hostname already in use");

        if (isPrimary) {
            await tx
                .update(companyDomains)
                .set({ is_primary: false })
                .where(
                    and(
                        eq(companyDomains.platform_id, platformId),
                        eq(companyDomains.company_id, data.company_id),
                        eq(companyDomains.is_primary, true)
                    )
                );
        }

        const [created] = await tx
            .insert(companyDomains)
            .values({
                platform_id: platformId,
                company_id: data.company_id,
                hostname: normalizedHostname,
                type: data.type,
                is_verified: data.is_verified ?? false,
                is_active: isActive,
                is_primary: isPrimary,
            })
            .returning();

        return created;
    });
};

const updateCompanyDomain = async (
    platformId: string,
    id: string,
    data: {
        hostname?: string;
        type?: "VANITY" | "CUSTOM";
        is_verified?: boolean;
        is_active?: boolean;
        is_primary?: boolean;
    }
) => {
    const [existing] = await db
        .select({
            id: companyDomains.id,
            company_id: companyDomains.company_id,
            is_primary: companyDomains.is_primary,
            is_active: companyDomains.is_active,
        })
        .from(companyDomains)
        .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)))
        .limit(1);
    if (!existing) throw new CustomizedError(404, "Company domain not found");

    const nextActive = data.is_active ?? existing.is_active;
    const nextPrimary = data.is_primary ?? existing.is_primary;

    if (nextPrimary && !nextActive) {
        throw new CustomizedError(400, "Primary domain must be active");
    }

    return db.transaction(async (tx) => {
        let replacementPrimaryId: string | null = null;

        if (data.hostname) {
            const normalizedHostname = normalizeHostname(data.hostname);
            const [conflict] = await tx
                .select({ id: companyDomains.id })
                .from(companyDomains)
                .where(eq(companyDomains.hostname, normalizedHostname))
                .limit(1);
            if (conflict && conflict.id !== id)
                throw new CustomizedError(409, "Hostname already in use");
            data.hostname = normalizedHostname;
        }

        if (nextPrimary) {
            await tx
                .update(companyDomains)
                .set({ is_primary: false })
                .where(
                    and(
                        eq(companyDomains.platform_id, platformId),
                        eq(companyDomains.company_id, existing.company_id),
                        eq(companyDomains.is_primary, true),
                        ne(companyDomains.id, id)
                    )
                );
        }

        if (existing.is_primary && (!nextPrimary || !nextActive)) {
            replacementPrimaryId = await findReplacementPrimary(
                tx,
                platformId,
                existing.company_id,
                id
            );
            if (!replacementPrimaryId) {
                throw new CustomizedError(
                    400,
                    "Cannot remove primary status without another active domain"
                );
            }
        }

        const [updated] = await tx
            .update(companyDomains)
            .set(data)
            .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)))
            .returning();

        if (replacementPrimaryId) {
            await tx
                .update(companyDomains)
                .set({ is_primary: true })
                .where(eq(companyDomains.id, replacementPrimaryId));
        }

        return updated;
    });
};

const deleteCompanyDomain = async (platformId: string, id: string) => {
    const [existing] = await db
        .select({
            id: companyDomains.id,
            company_id: companyDomains.company_id,
            is_primary: companyDomains.is_primary,
        })
        .from(companyDomains)
        .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)))
        .limit(1);
    if (!existing) throw new CustomizedError(404, "Company domain not found");

    await db.transaction(async (tx) => {
        let replacementPrimaryId: string | null = null;
        if (existing.is_primary) {
            replacementPrimaryId = await findReplacementPrimary(
                tx,
                platformId,
                existing.company_id,
                id
            );
            if (!replacementPrimaryId) {
                throw new CustomizedError(
                    400,
                    "Cannot delete primary domain without another active domain"
                );
            }
        }

        await tx
            .delete(companyDomains)
            .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)));

        if (replacementPrimaryId) {
            await tx
                .update(companyDomains)
                .set({ is_primary: true })
                .where(eq(companyDomains.id, replacementPrimaryId));
        }
    });
};

export const CompanyDomainServices = {
    listCompanyDomains,
    createCompanyDomain,
    updateCompanyDomain,
    deleteCompanyDomain,
};
