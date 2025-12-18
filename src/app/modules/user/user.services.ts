import { db } from "../../../db";
import { users } from "../../../db/schema";

// ----------------------------------- CREATE USER ------------------------------------
const createUser = async (data: any) => {
  const result = await db.insert(users).values(data).returning();
  return result;
};

export const UserServices = {
  createUser,
};
