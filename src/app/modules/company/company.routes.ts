import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CompanyControllers } from "./company.controllers";
import { CompanySchemas } from "./company.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import type { NextFunction, Request, Response } from "express";

const router = Router();

const requireCompanyUpdateAccess = (req: Request, res: Response, next: NextFunction) => {
    const bodyKeys = Object.keys(req.body || {});
    const onlyWarehouseOpsRate =
        bodyKeys.length > 0 && bodyKeys.every((key) => key === "warehouse_ops_rate");

    const middleware = onlyWarehouseOpsRate
        ? requirePermission(PERMISSIONS.COMPANIES_UPDATE, PERMISSIONS.WAREHOUSE_OPS_RATES_UPDATE)
        : requirePermission(PERMISSIONS.COMPANIES_UPDATE);

    return middleware(req, res, next);
};

// Create company
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.COMPANIES_CREATE),
    payloadValidator(CompanySchemas.createCompany),
    CompanyControllers.createCompany
);

// Get all companies
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.COMPANIES_READ, PERMISSIONS.WAREHOUSE_OPS_RATES_READ),
    CompanyControllers.getCompanies
);

// Get company by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.COMPANIES_READ, PERMISSIONS.WAREHOUSE_OPS_RATES_READ),
    CompanyControllers.getCompanyById
);

// Update company
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requireCompanyUpdateAccess,
    payloadValidator(CompanySchemas.updateCompany),
    CompanyControllers.updateCompany
);

// Delete company
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.COMPANIES_ARCHIVE),
    CompanyControllers.deleteCompany
);

export const CompanyRoutes = router;
