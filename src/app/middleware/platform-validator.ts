import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { db } from "../../db";
import { platforms } from "../../db/schema";
import { uuidRegex } from "../constants/common";
import CustomizedError from "../error/customized-error";

const platformValidator = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const platformId = req.headers["x-platform"] as string;

        // Check if platform ID exists
        if (!platformId) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Platform ID is required. Please provide 'x-platform' header."
            );
        }

        // Validate UUID format
        if (!uuidRegex.test(platformId)) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Invalid Platform ID format. Must be a valid UUID."
            );
        }

        // Check if platform exists in database
        const [platform] = await db
            .select({
                id: platforms.id,
                isActive: platforms.is_active,
            })
            .from(platforms)
            .where(eq(platforms.id, platformId));

        if (!platform) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Platform not found. Please provide a valid platform ID."
            );
        }

        if (!platform.isActive) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "Platform is inactive. Please contact support."
            );
        }

        // Attach platform ID to request object for easy access
        (req as any).platformId = platformId;

        next();
    } catch (error) {
        next(error);
    }
};

export default platformValidator;
