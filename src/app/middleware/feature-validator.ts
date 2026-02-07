import { NextFunction, Request, Response } from "express"
import httpStatus from "http-status"
import CustomizedError from "../error/customized-error"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { companies, platforms } from "../../db/schema"

const featureValidator = (featureName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platformId = req.headers["x-platform"] as string;
      const user = (req as any).user;
      const companyId = user.company_id;

      if (user.role === "CLIENT") {
        const company = await db.select({ features: companies.features })
          .from(companies)
          .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)))
          .limit(1)
          .execute();

        if (!company || company.length === 0) {
          throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
        }

        const companyFeatures = company[0].features as Record<string, boolean>;

        // check if feature is enabled for company if feature name is present in company features
        if (companyFeatures.hasOwnProperty(featureName)) {
          const isFeatureEnabled = companyFeatures?.[featureName] === true;

          if (!isFeatureEnabled) {
            throw new CustomizedError(httpStatus.FORBIDDEN, `Feature ${featureName.replace(/_/g, " ")} is not enabled for this company`);
          }
        } else {
          // check if feature is enabled for platform if feature name is not present in company features
          const platform = await db.select({ features: platforms.features })
            .from(platforms)
            .where(eq(platforms.id, platformId))
            .limit(1)
            .execute();

          const platformFeatures = platform[0].features as Record<string, boolean>;
          const isPlatformFeatureEnabled = platformFeatures?.[featureName] === true;

          // if feature is not enabled for platform then throw error
          if (!isPlatformFeatureEnabled) {
            throw new CustomizedError(httpStatus.FORBIDDEN, `Feature ${featureName.replace(/_/g, " ")} is not enabled for this company`);
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  }
}

export default featureValidator;