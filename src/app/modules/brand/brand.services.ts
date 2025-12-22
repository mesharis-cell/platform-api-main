import { and, eq, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { brands, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { isValidUrl } from "../../utils/helper";
import { CreateBrandPayload } from "./brand.interfaces";

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

export const BrandServices = {
  createBrand,
};
