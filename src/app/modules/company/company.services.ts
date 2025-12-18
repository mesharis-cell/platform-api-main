import { db } from "../../../db";
import { companies, companyDomains } from "../../../db/schema";

// ----------------------------------- CREATE COMPANY ---------------------------------
const createCompany = async (data: any) => {
  const result = await db.transaction(async (tx) => {
    // Create company
    const [company] = await tx.insert(companies).values(data).returning();

    // Create company domain
    const [domain] = await tx.insert(companyDomains).values({
      platform: data.platform,
      type: 'VANITY',
      company: company.id,
      hostname: data.domain,
    }).returning();

    // Return company with domain information
    return {
      ...company,
      domains: [domain],
    };
  });

  return result;
};

export const CompanyServices = {
  createCompany,
};