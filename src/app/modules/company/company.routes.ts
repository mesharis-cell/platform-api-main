import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { CompanyControllers } from "./company.controllers";
import { CompanySchemas } from "./company.schemas";

const router = Router();

router.post(
  "/",
  payloadValidator(CompanySchemas.createCompany),
  CompanyControllers.createCompany
);


router.get("/");

router.post("/upload-logo");

router.get("/:id");

router.put("/:id", payloadValidator(CompanySchemas.updateCompany));

router.delete("/:id");

export const CompanyRoutes = router;
