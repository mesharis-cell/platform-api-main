import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";

const requirePermission = (...requiredPermissions: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Step 1: Get authenticated user from request (set by auth middleware)
            const user = (req as any).user;

            if (!user) {
                throw new CustomizedError(httpStatus.UNAUTHORIZED, "User not authenticated");
            }

            // Step 2: Get user's permissions array from database
            const userPermissions: string[] = user.permissions || [];

            // Step 3: Check if user has permission
            const hasPermission = requiredPermissions.some((requiredPermission) => {
                // Check for exact permission match
                if (userPermissions.includes(requiredPermission)) {
                    return true;
                }

                // Check for wildcard permission match
                const [module] = requiredPermission.split(":");
                const wildcardPermission = `${module}:*`;

                // Check if user has wildcard permission for this module
                return userPermissions.includes(wildcardPermission);
            });

            if (!hasPermission) {
                const permissionList = requiredPermissions.join(", ");
                throw new CustomizedError(
                    httpStatus.FORBIDDEN,
                    `Access denied. Required permission: ${permissionList}`
                );
            }

            // Step 4: User has permission, proceed to next middleware
            next();
        } catch (error) {
            next(error);
        }
    };
};

export default requirePermission;
