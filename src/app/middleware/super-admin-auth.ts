import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { JwtPayload } from "jsonwebtoken";
import { db } from "../../db";
import { users } from "../../db/schema";
import config from "../config";
import CustomizedError from "../error/customized-error";
import { tokenVerifier } from "../utils/jwt-helpers";

const superAdminAuth = async (
    req: Request & { user?: JwtPayload },
    res: Response,
    next: NextFunction
) => {
    try {
        let token = req.headers.authorization;
        if (token?.startsWith("Bearer ")) {
            token = token.split("Bearer ")[1];
        }

        if (!token) {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "You are not authorized");
        }

        const verifiedUser = tokenVerifier(token, config.jwt_access_secret) as JwtPayload & {
            id?: string;
        };

        if (!verifiedUser?.id) {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid token payload");
        }

        const user = await db.query.users.findFirst({
            where: and(
                eq(users.id, verifiedUser.id),
                eq(users.is_super_admin, true),
                eq(users.is_active, true)
            ),
            with: {
                access_policy: {
                    columns: {
                        permissions: true,
                    },
                },
            },
        });

        if (!user) {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Super admin not found or inactive");
        }

        req.user = user as unknown as JwtPayload;
        next();
    } catch (error) {
        next(error);
    }
};

export default superAdminAuth;
