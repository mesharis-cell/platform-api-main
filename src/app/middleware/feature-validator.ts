import { NextFunction, Request, Response } from "express"
import httpStatus from "http-status"
import CustomizedError from "../error/customized-error"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { companies } from "../../db/schema"

const featureValidator = (featureName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const platformId = req.headers["x-platform"] as string;
      const companyId = (req as any).user.company_id;

      const company = await db.select({ features: companies.features })
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)))
        .limit(1)
        .execute();

      if (!company || company.length === 0) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
      }

      const companyFeatures = company[0].features as Record<string, boolean>;
      const isFeatureEnabled = companyFeatures?.[featureName] === true;

      if (!isFeatureEnabled) {
        throw new CustomizedError(httpStatus.FORBIDDEN, `Feature ${featureName.replace(/_/g, " ")} is not enabled for this company`);
      }
      next();
    } catch (error) {
      next(error);
    }
  }
}

export default featureValidator;