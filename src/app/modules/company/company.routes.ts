import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CompanyControllers } from "./company.controllers";
import { CompanySchemas } from "./company.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

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
    requirePermission(PERMISSIONS.COMPANIES_READ),
    CompanyControllers.getCompanies
);

// Get company by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    CompanyControllers.getCompanyById
);

// Update company
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.COMPANIES_UPDATE),
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
