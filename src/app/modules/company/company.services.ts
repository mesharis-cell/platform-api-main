import { and, asc, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, companyDomains } from "../../../db/schema";
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
      // Step 1: Create company
      const [company] = await tx.insert(companies).values(data).returning();

      // Step 2: Create company domain
      const [domain] = await tx
        .insert(companyDomains)
        .values({
          platform_id: data.platform_id,
          type: "VANITY",
          company_id: company.id,
          hostname: data.domain,
        })
        .returning();

      // Step 3: Return company with domain information
      return {
        ...company,
        domains: [domain],
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
    const [result] = await db
      .update(companies)
      .set({
        ...data,
      })
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
  // Step 1: Verify company exists and is not already deleted
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

  // Step 2: Soft delete company (set deleted_at timestamp)
  await db
    .update(companies)
    .set({
      deleted_at: new Date(),
    })
    .where(eq(companies.id, id))
    .returning();

  return null;
};

export const CompanyServices = {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
};