import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { CompanyDomainSchemas } from "./company-domain.schemas";

const router = Router();

router.post(
  "/",
  payloadValidator(CompanyDomainSchemas.createCompanyDomain),
);
router.get("/");
router.get("/:id");
router.put("/:id", payloadValidator(CompanyDomainSchemas.updateCompanyDomain));
router.delete("/:id");

export const CompanyRoutes = router;
