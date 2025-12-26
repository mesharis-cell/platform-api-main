import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import { db } from "../../../db";
import { companies, companyDomains, platforms, users } from "../../../db/schema";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { tokenGenerator } from "../../utils/jwt-helpers";
import { LoginCredential } from "./Auth.interfaces";

const login = async (credential: LoginCredential, platformId: string) => {
  const { email, password } = credential;

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

  if (accessToken && refreshToken) {
    await db.update(users)
      .set({
        last_login_at: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  return {
    ...userData,
    last_login_at: new Date(),
    access_token: accessToken,
    refresh_token: refreshToken,
  };
};

const getConfigByHostname = async (hostname: string) => {
  const subdomain = hostname.split(".")[0];

  // Step 1: Check if sub domain is admin or warehouse
  if (subdomain === "admin" || subdomain === "warehouse") {
    const rootDomain = hostname.split(".").slice(1).join(".");

    // Step 2: Return platform config
    const [platform] = await db
      .select({
        id: platforms.id,
        config: platforms.config,
      })
      .from(platforms)
      .where(eq(platforms.domain, rootDomain))
      .limit(1);

    if (platform) {
      const config = platform.config as any;
      return {
        platform_id: platform.id,
        company_id: null,
        company_name: null,
        logo_url: config?.logo_url || null,
        primary_color: config?.primary_color || null,
        secondary_color: config?.secondary_color || null,
        currency: config?.currency || null,
      };
    }
    return null;
  }

  // Step 3: If it's not admin or warehouse, it's a company domain
  const [result] = await db
    .select({
      platform_id: companyDomains.platform_id,
      company_id: companyDomains.company_id,
      company_name: companies.name,
      settings: companies.settings,
    })
    .from(companyDomains)
    .innerJoin(companies, eq(companyDomains.company_id, companies.id))
    .where(eq(companyDomains.hostname, hostname))
    .limit(1);

  if (result) {
    const settings = result.settings as any;
    const branding = settings?.branding || {};

    return {
      platform_id: result.platform_id,
      company_id: result.company_id,
      company_name: result.company_name,
      logo_url: branding?.logo_url || null,
      primary_color: branding?.primary_color || null,
      secondary_color: branding?.secondary_color || null,
      currency: null,
    };
  }

  return null;
};

export const AuthServices = {
  login,
  getConfigByHostname,
};
