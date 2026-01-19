import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assets, collections, companies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import paginationMaker from "../../utils/pagination-maker";
import { CatalogResult } from "./catalog.interfaces";

const getCatalog = async (
  query: Record<string, unknown>,
  user: any,
  platformId: string
): Promise<CatalogResult> => {
  const brand_id = (query.brand as string) || undefined;
  const category = (query.category as string) || undefined;
  const search_term = (query.search_term as string) || undefined;
  const type = (query.type as string) || "all";

  const { pageNumber, limitNumber, skip } = paginationMaker({
    page: Number(query.page) || undefined,
    limit: Number(query.limit) || undefined,
  });

  const limit = limitNumber;
  const offset = skip;

  const finalCompanyId = user.company_id;

  // Ensure company_id is provided
  if (!finalCompanyId) {
    throw new CustomizedError(httpStatus.BAD_REQUEST, "User is not associated with any company");
  }

  // Verify company exists and belongs to platform
  const [company] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.id, finalCompanyId),
        eq(companies.platform_id, platformId),
        isNull(companies.deleted_at)
      )
    );

  if (!company) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or invalid for this platform");
  }

  const result: CatalogResult = {
    assets: [],
    collections: [],
    meta: {
      total_assets: 0,
      total_collections: 0,
      page: pageNumber,
      limit: limitNumber,
    },
  };

  // Build Asset Conditions
  const assetConditions: any[] = [];
  if (finalCompanyId) assetConditions.push(eq(assets.company_id, finalCompanyId as string));
  if (brand_id) assetConditions.push(eq(assets.brand_id, brand_id as string));
  if (category) assetConditions.push(eq(assets.category, category as string));
  if (search_term) {
    const searchTerm = search_term.trim();
    assetConditions.push(
      or(
        ilike(assets.name, `%${searchTerm}%`),
        ilike(assets.description, `%${searchTerm}%`),
        ilike(assets.qr_code, `%${searchTerm}%`)
      )
    );
  }

  // assetConditions.push(eq(assets.status, "AVAILABLE"));
  assetConditions.push(isNull(assets.deleted_at));

  // Build Collection Conditions
  const collectionConditions: any[] = [];
  if (finalCompanyId) collectionConditions.push(eq(collections.company_id, finalCompanyId as string));
  if (brand_id) collectionConditions.push(eq(collections.brand_id, brand_id as string));
  if (category) collectionConditions.push(eq(collections.category, category as string));
  if (search_term) {
    const searchTerm = search_term.trim();
    collectionConditions.push(
      or(
        ilike(collections.name, `%${searchTerm}%`),
        ilike(collections.description, `%${searchTerm}%`)
      )
    );
  }
  collectionConditions.push(eq(collections.is_active, true));
  collectionConditions.push(isNull(collections.deleted_at));

  // Execute Queries based on type
  if (type === "asset" || type === "all") {
    // Assets
    const [assetData, assetCount] = await Promise.all([
      db.query.assets.findMany({
        where: and(...assetConditions),
        limit: limit,
        offset: offset,
        orderBy: [desc(assets.created_at)],
        with: {
          brand: true,
          company: true
        }
      }),
      db
        .select({ count: count() })
        .from(assets)
        .where(and(...assetConditions)),
    ]);
    result.assets = assetData;
    result.meta!.total_assets = assetCount[0].count;
  }

  if (type === "collection" || type === "all") {
    // Collections
    const [collectionData, collectionCount] = await Promise.all([
      db.query.collections.findMany({
        where: and(...collectionConditions),
        limit: limit,
        offset: offset,
        orderBy: [desc(collections.created_at)],
        with: {
          brand: true,
          company: true
        }
      }),
      db
        .select({ count: count() })
        .from(collections)
        .where(and(...collectionConditions)),
    ]);
    result.collections = collectionData;
    result.meta!.total_collections = collectionCount[0].count;
  }

  return result;
};

export const CatalogServices = {
  getCatalog,
};
