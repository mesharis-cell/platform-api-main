import { db } from "../../../db";
import { platforms } from "../../../db/schema";

// ----------------------------------- CREATE PLATFORM --------------------------------
const createPlatform = async (data: any) => {
  const result = await db.insert(platforms).values(data).returning();
  return result;
};

export const PlatformServices = {
  createPlatform,
};
