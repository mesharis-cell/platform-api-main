import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { companies, platforms } from "../../db/schema";

const featureValidator = (featureName: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const platformId = req.headers["x-platform"] as string;
            const user = (req as any).user;
            const [platform] = await db
                .select({ features: platforms.features })
                .from(platforms)
                .where(eq(platforms.id, platformId))
                .limit(1)
                .execute();

            if (!platform) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Platform not found");
            }

            const platformFeatures = platform.features as Record<string, boolean>;
            const platformEnabled = platformFeatures?.[featureName] === true;

            if (user?.role === "CLIENT") {
                const companyId = user.company_id;
                if (!companyId) {
                    throw new CustomizedError(
                        httpStatus.FORBIDDEN,
                        "Client account has no company"
                    );
                }

                const [company] = await db
                    .select({ features: companies.features })
                    .from(companies)
                    .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)))
                    .limit(1)
                    .execute();

                if (!company) throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");

                const companyFeatures = company.features as Record<string, boolean>;
                const companyHasOverride = Object.prototype.hasOwnProperty.call(
                    companyFeatures,
                    featureName
                );
                const enabled = companyHasOverride
                    ? companyFeatures?.[featureName] === true
                    : platformEnabled;

                if (!enabled) {
                    throw new CustomizedError(
                        httpStatus.FORBIDDEN,
                        `Feature ${featureName.replace(/_/g, " ")} is not enabled`
                    );
                }
            } else if (!platformEnabled) {
                throw new CustomizedError(
                    httpStatus.FORBIDDEN,
                    `Feature ${featureName.replace(/_/g, " ")} is not enabled`
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

export default featureValidator;
