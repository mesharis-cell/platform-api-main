import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import jwt, { Secret } from "jsonwebtoken";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { LoginCredential } from "./Auth.interfaces";
import { tokenGenerator } from "../../utils/jwt-helpers";

const login = async (credential: LoginCredential, platformId: string) => {
  const { email, password } = credential;

  // Search by email
  // Also filtering by platformId as requested
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, email),
        eq(users.platform_id, platformId)
      )
    );

  if (!user) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.is_active) {
    throw new CustomizedError(httpStatus.FORBIDDEN, "User account is not active");
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid password");
  }

  // Remove password from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pass, ...userData } = user;

  const jwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    company_id: user.company_id,
    platform_id: user.platform_id
  };

  const accessToken = tokenGenerator(
    jwtPayload,
    config.jwt_access_secret as Secret,
    config.jwt_access_expires_in
  );

  const refreshToken = tokenGenerator(
    jwtPayload,
    config.jwt_refresh_secret as Secret,
    config.jwt_refresh_expires_in
  );

  return {
    ...userData,
    access_token: accessToken,
    refresh_token: refreshToken,
  };
};

export const AuthServices = {
  login,
};
