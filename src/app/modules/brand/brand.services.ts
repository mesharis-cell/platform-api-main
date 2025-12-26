import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { brands, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { isValidUrl } from "../../utils/helper";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateBrandPayload } from "./brand.interfaces";
import { brandQueryValidationConfig, brandSortableFields } from "./brand.utils";

// ----------------------------------- CREATE BRAND -----------------------------------
const createBrand = async (data: CreateBrandPayload) => {
  try {
    // Step 1: Validate company exists and is not archived
    const [company] = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.id, data.company_id),
          isNull(companies.deleted_at),
        ),
      );

    if (!company) {
      throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
    }

    // Step 2: Validate logo URL format if provided
    if (data.logo_url && !isValidUrl(data.logo_url)) {
      throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid logo URL format. Must start with http:// or https:// and be under 500 characters");
    }

    // Step 3: Insert brand into database
    const [result] = await db.insert(brands).values(data).returning();
    return result;
  } catch (error: any) {
    // Step 4: Handle database errors
    const pgError = error.cause || error;

    if (pgError.code === '23505') {
      if (pgError.constraint === 'brands_company_name_unique') {
        throw new CustomizedError(
          httpStatus.CONFLICT,
          `Brand with name "${data.name}" already exists for this company`
        );
      }
      throw new CustomizedError(
        httpStatus.CONFLICT,
        'A brand with these details already exists'
      );
    }

    throw error;
  }
};

// ----------------------------------- GET BRANDS -------------------------------------
const getBrands = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
  const {
    search_term,
    page,
    limit,
    sort_by,
    sort_order,
    company_id,
    include_inactive
  } = query;

  // Step 1: Validate query parameters
  if (sort_by) queryValidator(brandQueryValidationConfig, "sort_by", sort_by);
  if (sort_order)
    queryValidator(brandQueryValidationConfig, "sort_order", sort_order);

  // Step 2: Setup pagination
  const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
    paginationMaker({
      page,
      limit,
      sort_by,
      sort_order,
    });

  // Step 3: Build WHERE conditions
  const conditions: any[] = [eq(brands.platform_id, platformId)];

  // Step 3a: Filter by user role (CLIENT users see only their company's brands)
  if (user.role === 'CLIENT') {
    if (user.company_id) {
      conditions.push(
        eq(brands.company_id, user.company_id),
      );
    } else {
      throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
    }
  }

  // Step 3b: Search by brand name
  if (search_term) {
    conditions.push(
      ilike(brands.name, `%${search_term.trim()}%`),
    );
  }

  // Step 3c: Filter by company ID
  if (company_id) {
    conditions.push(eq(brands.company_id, company_id));
  }

  // Step 3d: Filter by active status (default: only active brands)
  if (include_inactive !== 'true') {
    conditions.push(eq(brands.is_active, true));
  }

  // Step 4: Determine sort order
  const orderByColumn = brandSortableFields[sortWith] || brands.created_at;
  const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

  // Step 5: Execute queries in parallel (data + count)
  const [result, total] = await Promise.all([
    db.query.brands.findMany({
      where: and(...conditions),
      with: {
        company: {
          columns: {
            id: true,
            name: true,
            domain: true,
          },
        },
      },
      orderBy: orderDirection,
      limit: limitNumber,
      offset: skip,
    }),

    db
      .select({
        count: count(),
      })
      .from(brands)
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

// ----------------------------------- GET BRAND BY ID --------------------------------
const getBrandById = async (id: string, user: AuthUser, platformId: string) => {
  // Step 1: Build WHERE conditions
  const conditions: any[] = [
    eq(brands.id, id),
    eq(brands.platform_id, platformId),
  ];

  // Step 2: Filter by user role (CLIENT users can only see their company's brands)
  if (user.role === 'CLIENT') {
    if (user.company_id) {
      conditions.push(eq(brands.company_id, user.company_id));
    } else {
      throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
    }
  }

  // Step 3: Fetch brand with company information
  const brand = await db.query.brands.findFirst({
    where: and(...conditions),
    with: {
      company: {
        columns: {
          id: true,
          name: true,
          domain: true,
        },
      },
    },
  });

  // Step 4: Handle not found
  if (!brand) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "Brand not found");
  }

  return brand;
};

// ----------------------------------- UPDATE BRAND -----------------------------------
const updateBrand = async (id: string, data: any, user: AuthUser, platformId: string) => {
  try {
    // Step 1: Verify brand exists and user has access
    const conditions: any[] = [
      eq(brands.id, id),
      eq(brands.platform_id, platformId),
    ];

    const [existingBrand] = await db
      .select()
      .from(brands)
      .where(and(...conditions));

    if (!existingBrand) {
      throw new CustomizedError(httpStatus.NOT_FOUND, "Brand not found");
    }

    // Step 2: Validate logo URL format if provided
    if (data.logo_url && !isValidUrl(data.logo_url)) {
      throw new CustomizedError(
        httpStatus.BAD_REQUEST,
        "Invalid logo URL format. Must start with http:// or https:// and be under 500 characters"
      );
    }

    // Step 3: Update brand
    const [result] = await db
      .update(brands)
      .set({
        ...data,
      })
      .where(eq(brands.id, id))
      .returning();

    return result;
  } catch (error: any) {
    // Step 4: Handle database errors
    const pgError = error.cause || error;

    if (pgError.code === '23505') {
      if (pgError.constraint === 'brands_company_name_unique') {
        throw new CustomizedError(
          httpStatus.CONFLICT,
          `Brand with name "${data.name}" already exists for this company`
        );
      }
      throw new CustomizedError(
        httpStatus.CONFLICT,
        'A brand with these details already exists'
      );
    }

    throw error;
  }
};

// ----------------------------------- DELETE BRAND -----------------------------------
const deleteBrand = async (id: string, user: AuthUser, platformId: string) => {
  // Step 1: Verify brand exists and user has access
  const conditions: any[] = [
    eq(brands.id, id),
    eq(brands.platform_id, platformId),
  ];

  const [existingBrand] = await db
    .select()
    .from(brands)
    .where(and(...conditions));

  if (!existingBrand) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "Brand not found");
  }

  // Step 2: Mark brand as active/inactive
  await db
    .update(brands)
    .set({
      is_active: existingBrand.is_active ? false : true,
      updated_at: new Date(),
    })
    .where(eq(brands.id, id))
    .returning();

  return null;
};

export const BrandServices = {
  createBrand,
  getBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
};
