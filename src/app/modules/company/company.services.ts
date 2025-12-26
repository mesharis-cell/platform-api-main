import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, companyDomains, platforms } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateCompanyPayload } from "./company.interfaces";
import { companyQueryValidationConfig, companySortableFields } from "./company.utils";

// ----------------------------------- CREATE COMPANY -----------------------------------
const createCompany = async (data: CreateCompanyPayload) => {
  try {
    const result = await db.transaction(async (tx) => {
      // Fetch platform to get the base domain for vanity URLs
      const [platform] = await tx
        .select()
        .from(platforms)
        .where(eq(platforms.id, data.platform_id));

      if (!platform) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Platform not found");
      }

      let companyDomain = data.domain;
      let hostnames: { hostname: string; type: "VANITY" | "CUSTOM" }[] = [];

      // Logic to handle domain scenarios
      if (!data.domain.includes(".")) {
        // Case 1: Subdomain (e.g., "richard")
        companyDomain = data.domain;
        hostnames.push({
          hostname: `${data.domain}.${platform.domain}`,
          type: "VANITY",
        });
      } else {
        // Case 2: Custom Domain (e.g., "custom.com" or "sub.custom.com")
        hostnames.push({
          hostname: data.domain,
          type: "CUSTOM",
        });

        const parts = data.domain.split(".");
        if (parts.length > 2) {
          // Case 3: Subdomain of custom domain (e.g., "sub.custom.com")
          // company domain = "custom.com" (root domain)
          companyDomain = parts.slice(-2).join(".");
        } else {
          // Case 2: Custom domain (e.g., "custom.com")
          // company domain = "custom.com"
          companyDomain = data.domain;
        }
      }

      // Step 1: Create company
      const dbData: any = {
        ...data,
        domain: companyDomain,
      };

      // Convert platform_margin_percent to string if provided
      if (data.platform_margin_percent !== undefined) {
        dbData.platform_margin_percent = data.platform_margin_percent.toString();
      }

      const [company] = await tx.insert(companies).values(dbData).returning();

      // Step 2: Create company domain(s)
      const createdDomains = [];
      for (const h of hostnames) {
        const [domain] = await tx
          .insert(companyDomains)
          .values({
            platform_id: data.platform_id,
            type: h.type,
            company_id: company.id,
            hostname: h.hostname,
          })
          .returning();
        createdDomains.push(domain);
      }

      // Step 3: Return company with domain information
      return {
        ...company,
        domains: createdDomains,
      };
    });

    return result;
  } catch (error: any) {
    // Step 4: Handle database errors
    const pgError = error.cause || error;

    if (pgError.code === "23505") {
      if (pgError.constraint === "companies_platform_domain_unique") {
        throw new CustomizedError(
          httpStatus.CONFLICT,
          `Company with domain "${data.domain}" already exists for this platform`
        );
      }
      if (pgError.constraint === "company_domains_hostname_key") {
        throw new CustomizedError(
          httpStatus.CONFLICT,
          `Hostname "${data.domain}" is already taken`
        );
      }
      throw new CustomizedError(
        httpStatus.CONFLICT,
        "A company with these details already exists"
      );
    }

    throw error;
  }
};

// ----------------------------------- GET COMPANIES -------------------------------------
const getCompanies = async (query: Record<string, any>, platformId: string) => {
  const {
    search_term,
    page,
    limit,
    sort_by,
    sort_order,
    include_inactive,
    include_deleted,
  } = query;

  // Step 1: Validate query parameters
  if (sort_by) queryValidator(companyQueryValidationConfig, "sort_by", sort_by);
  if (sort_order)
    queryValidator(companyQueryValidationConfig, "sort_order", sort_order);

  // Step 2: Setup pagination
  const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
    paginationMaker({
      page,
      limit,
      sort_by,
      sort_order,
    });

  // Step 3: Build WHERE conditions
  const conditions: any[] = [eq(companies.platform_id, platformId)];

  // Step 3a: Search by company name or domain
  if (search_term) {
    conditions.push(
      or(
        ilike(companies.name, `%${search_term.trim()}%`),
        ilike(companies.domain, `%${search_term.trim()}%`)
      )
    );
  }

  // Step 3b: Filter by active status (default: only active companies)
  if (include_inactive !== "true") {
    conditions.push(eq(companies.is_active, true));
  }

  // Step 3c: Filter by deleted status (default: exclude deleted companies)
  if (include_deleted !== "true") {
    conditions.push(isNull(companies.deleted_at));
  }

  // Step 4: Determine sort order
  const orderByColumn = companySortableFields[sortWith] || companies.created_at;
  const orderDirection =
    sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

  // Step 5: Execute queries in parallel (data + count)
  const [result, total] = await Promise.all([
    db.query.companies.findMany({
      where: and(...conditions),
      with: {
        domains: true, // Include all related company domains
      },
      orderBy: orderDirection,
      limit: limitNumber,
      offset: skip,
    }),

    db
      .select({
        count: count(),
      })
      .from(companies)
      .where(and(...conditions)),
  ]);

  // Step 6: Return paginated response
  return {
    meta: {
      page: pageNumber,
      limit: limitNumber,
      total: total[0].count,
    },
    data: result,
  };
};

// ----------------------------------- GET COMPANY BY ID --------------------------------
const getCompanyById = async (id: string, platformId: string, user: AuthUser) => {
  // Step 1: Check if user is authorized to access this company
  if (user.role === 'CLIENT' && user.company_id !== id) {
    throw new CustomizedError(httpStatus.UNAUTHORIZED, "You are not authorized to access this company");
  }

  // Step 2: Build WHERE conditions
  const conditions: any[] = [
    eq(companies.id, id),
    eq(companies.platform_id, platformId),
    isNull(companies.deleted_at), // Exclude deleted companies
  ];

  // Step 3: Fetch company with domains
  const company = await db.query.companies.findFirst({
    where: and(...conditions),
    with: {
      domains: true,
    },
  });

  // Step 4: Handle not found
  if (!company) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
  }

  return company;
};

// ----------------------------------- UPDATE COMPANY -----------------------------------
const updateCompany = async (id: string, data: any, platformId: string) => {
  try {
    // Step 1: Verify company exists and is not deleted
    const conditions: any[] = [
      eq(companies.id, id),
      eq(companies.platform_id, platformId),
      isNull(companies.deleted_at),
    ];

    const [existingCompany] = await db
      .select()
      .from(companies)
      .where(and(...conditions));

    if (!existingCompany) {
      throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
    }

    // Step 2: Update company
    // Convert number fields to strings for database (decimal types)
    const dbData: any = { ...data };

    if (data.platform_margin_percent !== undefined) {
      dbData.platform_margin_percent = data.platform_margin_percent.toString();
    }

    const [result] = await db
      .update(companies)
      .set(dbData)
      .where(eq(companies.id, id))
      .returning();

    return result;
  } catch (error: any) {
    // Step 3: Handle database errors
    const pgError = error.cause || error;

    if (pgError.code === "23505") {
      if (pgError.constraint === "companies_platform_domain_unique") {
        throw new CustomizedError(
          httpStatus.CONFLICT,
          `Company with domain "${data.domain}" already exists for this platform`
        );
      }
      throw new CustomizedError(
        httpStatus.CONFLICT,
        "A company with these details already exists"
      );
    }

    throw error;
  }
};

// ----------------------------------- DELETE COMPANY -----------------------------------
const deleteCompany = async (id: string, platformId: string) => {
  console.log("id....", id);
  console.log("platformId....", platformId);

  // Step 1: Verify company exists and is not already deleted
  const conditions: any[] = [
    eq(companies.id, id),
    eq(companies.platform_id, platformId),
  ];

  const [existingCompany] = await db
    .select()
    .from(companies)
    .where(and(...conditions));

  if (!existingCompany) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
  }

  // Step 2: If already have deleted_at set null otherwise set new Date()
  const [result] = await db
    .update(companies)
    .set({
      deleted_at: existingCompany.deleted_at ? null : new Date(),
    })
    .where(eq(companies.id, id))
    .returning();

  console.log("result....", result);

  return result;
};

export const CompanyServices = {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
};