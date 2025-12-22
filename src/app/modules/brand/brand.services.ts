import { db } from "../../../db";
import { brands } from "../../../db/schema";
import { CreateBrandPayload } from "./brand.interfaces";

// ----------------------------------- CREATE BRAND -----------------------------------
const createBrand = async (data: CreateBrandPayload) => {
  const [result] = await db.insert(brands).values(data).returning();
  return result;
};

export const BrandServices = {
  createBrand,
};
