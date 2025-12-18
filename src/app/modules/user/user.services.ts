import bcrypt from "bcrypt";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import config from "../../config";

// ----------------------------------- CREATE USER ------------------------------------
const createUser = async (data: any) => {
  // Hash the password
  const hashedPassword = await bcrypt.hash(
    data.password,
    config.salt_rounds
  );

  // Prepare user data with hashed password
  const userData = {
    ...data,
    password: hashedPassword,
  };

  const result = await db.insert(users).values(userData).returning();
  return result[0];
};

export const UserServices = {
  createUser,
};
