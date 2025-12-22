import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { brands, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { isValidUrl } from "../../utils/helper";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { CreateBrandPayload } from "./brand.interfaces";
import { brandQueryValidationConfig } from "./brand.utils";

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
const getBrands = async (query: Record<string, any>) => {
  const {
    search_term,
    page,
    limit,
    sort_by,
    sort_order
  } = query;

  if (sort_by) queryValidator(brandQueryValidationConfig, "sort_by", sort_by);
  if (sort_order)
    queryValidator(brandQueryValidationConfig, "sort_order", sort_order);

  const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
    paginationMaker({
      page,
      limit,
      sort_by,
      sort_order,
    });

  // Build WHERE conditions
  const conditions: any[] = [];

  // Search term - case insensitive search on name
  if (search_term) {
    conditions.push(
      ilike(brands.name, `%${search_term.trim()}%`),
    );
  }

  // Determine sort order
  let orderByColumn: any = brands.created_at; // default
  if (sortWith === "name") orderByColumn = brands.name;
  else if (sortWith === "created_at") orderByColumn = brands.created_at;
  else if (sortWith === "updated_at") orderByColumn = brands.updated_at;

  const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

  // Execute queries in parallel
  const [result, total] = await Promise.all([
    // Get paginated brands using query API
    db.query.brands.findMany({
      where: and(...conditions),
      orderBy: orderDirection,
      limit: limitNumber,
      offset: skip,
    }),

    // Get count
    db
      .select({
        count: count(),
      })
      .from(brands)
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

export const BrandServices = {
  createBrand,
  getBrands
};
