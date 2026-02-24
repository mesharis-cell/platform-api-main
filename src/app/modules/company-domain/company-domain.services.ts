import { eq, and } from "drizzle-orm";
import { db } from "../../../db";
import { companyDomains, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";

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
    }
) => {
    const [existing] = await db
        .select({ id: companyDomains.id })
        .from(companyDomains)
        .where(eq(companyDomains.hostname, data.hostname))
        .limit(1);
    if (existing) throw new CustomizedError(409, "Hostname already in use");

    const [created] = await db
        .insert(companyDomains)
        .values({ platform_id: platformId, ...data })
        .returning();
    return created;
};

const updateCompanyDomain = async (
    platformId: string,
    id: string,
    data: {
        hostname?: string;
        type?: "VANITY" | "CUSTOM";
        is_verified?: boolean;
        is_active?: boolean;
    }
) => {
    const [existing] = await db
        .select({ id: companyDomains.id })
        .from(companyDomains)
        .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)))
        .limit(1);
    if (!existing) throw new CustomizedError(404, "Company domain not found");

    if (data.hostname) {
        const [conflict] = await db
            .select({ id: companyDomains.id })
            .from(companyDomains)
            .where(eq(companyDomains.hostname, data.hostname))
            .limit(1);
        if (conflict && conflict.id !== id)
            throw new CustomizedError(409, "Hostname already in use");
    }

    const [updated] = await db
        .update(companyDomains)
        .set(data)
        .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)))
        .returning();
    return updated;
};

const deleteCompanyDomain = async (platformId: string, id: string) => {
    const [existing] = await db
        .select({ id: companyDomains.id })
        .from(companyDomains)
        .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)))
        .limit(1);
    if (!existing) throw new CustomizedError(404, "Company domain not found");

    await db
        .delete(companyDomains)
        .where(and(eq(companyDomains.id, id), eq(companyDomains.platform_id, platformId)));
};

export const CompanyDomainServices = {
    listCompanyDomains,
    createCompanyDomain,
    updateCompanyDomain,
    deleteCompanyDomain,
};
