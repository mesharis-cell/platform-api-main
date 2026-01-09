import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";

/**
 * Middleware to check if authenticated user has required permission(s)
 * 
 * Supports wildcard permissions:
 * - If user has 'assets:*', they can access any 'assets:xxx' permission
 * - If user has 'collections:*', they can access any 'collections:xxx' permission
 * 
 * Usage:
 * - Single permission: requirePermission('orders:create')
 * - Multiple permissions (OR logic): requirePermission('orders:create', 'orders:update')
 * 
 * IMPORTANT: Must be used AFTER auth() middleware
 * 
 * @param requiredPermissions - One or more permission strings to check
 * @returns Express middleware function
 */
const requirePermission = (...requiredPermissions: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get authenticated user from request (set by auth middleware)
            const user = (req as any).user;

            // Ensure user is authenticated
            if (!user) {
                throw new CustomizedError(
                    httpStatus.UNAUTHORIZED,
                    "Authentication required. Please use auth() middleware before requirePermission()"
                );
            }

            // Get user's permissions array from database
            const userPermissions: string[] = user.permissions || [];

            /**
             * Check if user has permission
             * Supports both exact match and wildcard match
             * 
             * Examples:
             * - User has 'assets:read' → Can access 'assets:read'
             * - User has 'assets:*' → Can access 'assets:read', 'assets:create', 'assets:update', etc.
             */
            const hasPermission = requiredPermissions.some(requiredPermission => {
                // Check for exact permission match
                if (userPermissions.includes(requiredPermission)) {
                    return true;
                }

                // Check for wildcard permission match
                // Extract module from required permission (e.g., 'assets' from 'assets:read')
                const [module] = requiredPermission.split(':');
                const wildcardPermission = `${module}:*`;

                // Check if user has wildcard permission for this module
                return userPermissions.includes(wildcardPermission);
            });

            if (!hasPermission) {
                const permissionList = requiredPermissions.join(', ');
                throw new CustomizedError(
                    httpStatus.FORBIDDEN,
                    `Access denied. Required permission: ${permissionList}`
                );
            }

            // User has permission, proceed to next middleware
            next();
        } catch (error) {
            next(error);
        }
    };
};

export default requirePermission;
