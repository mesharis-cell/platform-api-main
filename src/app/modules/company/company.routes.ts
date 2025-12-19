import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CompanyControllers } from "./company.controllers";
import { CompanySchemas } from "./company.schemas";

const router = Router();

// Create company
router.post(
  "/",
  platformValidator,
  auth('ADMIN'),
  payloadValidator(CompanySchemas.createCompany),
  CompanyControllers.createCompany
);

router.get(
  "/",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  CompanyControllers.getCompanies
);

// TODO: Implement these routes
// router.post("/upload-logo");
// router.get("/:id");
// router.put("/:id", payloadValidator(CompanySchemas.updateCompany));
// router.delete("/:id");

export const CompanyRoutes = router;
