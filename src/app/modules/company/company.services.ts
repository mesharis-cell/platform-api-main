import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../../db";
import { companies, companyDomains } from "../../../db/schema";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { companyQueryValidationConfig } from "./company.utils";

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

const getCompanies = async (platformId: string, query: Record<string, any>) => {
  const {
    search_term,
    page,
    limit,
    sort_by,
    sort_order
  } = query;

  if (sort_by) queryValidator(companyQueryValidationConfig, "sort_by", sort_by);
  if (sort_order)
    queryValidator(companyQueryValidationConfig, "sort_order", sort_order);

  const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
    paginationMaker({
      page,
      limit,
      sort_by,
      sort_order,
    });

  // Build WHERE conditions
  const conditions: any[] = [eq(companies.platform, platformId)];

  // Search term - case insensitive search on name and domain
  if (search_term) {
    conditions.push(
      or(
        ilike(companies.name, `%${search_term.trim()}%`),
        ilike(companies.domain, `%${search_term.trim()}%`)
      )
    );
  }

  // Determine sort order
  let orderByColumn: any = companies.createdAt; // default
  if (sortWith === "id") orderByColumn = companies.id;
  else if (sortWith === "name") orderByColumn = companies.name;
  else if (sortWith === "domain") orderByColumn = companies.domain;
  else if (sortWith === "created_at" || sortWith === "createdAt") orderByColumn = companies.createdAt;
  else if (sortWith === "updated_at" || sortWith === "updatedAt") orderByColumn = companies.updatedAt;

  const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

  // Execute queries in parallel
  const [result, total] = await Promise.all([
    // Get paginated companies with their domains using query API
    db.query.companies.findMany({
      where: and(...conditions),
      with: {
        domains: true, // Include all related company domains
      },
      orderBy: orderDirection,
      limit: limitNumber,
      offset: skip,
    }),

    // Get count
    db
      .select({
        count: count(),
      })
      .from(companies)
      .where(and(...conditions)),
  ]);

  return {
    meta: {
      page: pageNumber,
      limit: limitNumber,
      total: total[0].count,
    },
    data: result,
  };
};

export const CompanyServices = {
  createCompany,
  getCompanies,
};