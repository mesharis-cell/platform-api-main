import z from "zod";
import { CompanySchemas } from "./company.schemas";

export type CreateCompanyPayload = z.infer<typeof CompanySchemas.createCompany>["body"] & {
    platform_id: string;
};

export type UpdateCompanyPayload = z.infer<typeof CompanySchemas.updateCompany>["body"];
