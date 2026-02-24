import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CompanyDomainControllers } from "./company-domain.controllers";
import { CompanyDomainSchemas } from "./company-domain.schemas";

const router = Router();

router.use(platformValidator, auth("ADMIN"));

router.get("/", CompanyDomainControllers.listCompanyDomains);
router.post(
    "/",
    payloadValidator(CompanyDomainSchemas.createCompanyDomain),
    CompanyDomainControllers.createCompanyDomain
);
router.put(
    "/:id",
    payloadValidator(CompanyDomainSchemas.updateCompanyDomain),
    CompanyDomainControllers.updateCompanyDomain
);
router.delete("/:id", CompanyDomainControllers.deleteCompanyDomain);

export const CompanyDomainRoutes = router;
