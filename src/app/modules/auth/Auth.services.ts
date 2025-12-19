import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import jwt, { Secret } from "jsonwebtoken";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import config from "../../config";
import ApiError from "../../error/ApiError";
import { LoginCredential } from "./Auth.interfaces";

const generateToken = (
  payload: Record<string, unknown>,
  secret: Secret,
  expiresIn: string
) => {
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as any,
  });
};

const login = async (credential: LoginCredential, platformId: string) => {
  const { email_or_contact_number, password } = credential;

  // Search by email only as contact_number is not in schema
  // Also filtering by platformId as requested
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, email_or_contact_number),
        eq(users.platform, platformId)
      )
    );

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isActive) {
    throw new ApiError(httpStatus.FORBIDDEN, "User account is not active");
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid password");
  }

  // Remove password from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pass, ...userData } = user;

  const jwtPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    company: user.company,
    platform: user.platform
  };

  const accessToken = generateToken(
    jwtPayload,
    config.jwt_access_secret as Secret,
    config.jwt_access_expires_in as string
  );

  const refreshToken = generateToken(
    jwtPayload,
    config.jwt_refresh_secret as Secret,
    config.jwt_refresh_expires_in as string
  );

  return {
    ...userData,
    accessToken,
    refreshToken,
  };
};

export const AuthServices = {
  login,
};
