import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { JwtPayload } from "jsonwebtoken";
import { db } from "../../db";
import { users } from "../../db/schema";
import config from "../config";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";
import { UserRole } from "../modules/user/user.interfaces";
import { tokenVerifier } from "../utils/jwt-helpers";

const auth = (...roles: UserRole[]) => {
  return async (
    req: Request & { user?: JwtPayload },
    res: Response,
    next: NextFunction
  ) => {
    try {
      const platformId = (req as any).platformId;
      let token = req.headers.authorization;
      if (token?.startsWith("Bearer ")) {
        token = token.split("Bearer ")[1];
      }
      if (!token) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "You are not authorized");
      }

      const verifiedUser = tokenVerifier(
        token,
        config.jwt_access_secret
      ) as AuthUser;

      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.platform_id, platformId),
            eq(users.id, verifiedUser?.id),
            eq(users.is_active, true)
          )
        );

      if (!user) {
        throw new CustomizedError(
          httpStatus.UNAUTHORIZED,
          "User not found or inactive"
        );
      }

      if (roles?.length && !roles.includes(verifiedUser?.role)) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "You are not authorized");
      }

      req.user = verifiedUser;

      next();
    } catch (error: any) {
      next(error);
    }
  };
};

export default auth;
