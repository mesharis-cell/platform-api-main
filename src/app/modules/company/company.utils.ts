import { companies } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const companySortableFields: Record<string, any> = {
  name: companies.name,
  domain: companies.domain,
  created_at: companies.created_at,
  updated_at: companies.updated_at,
};

export const companyQueryValidationConfig = {
  sort_by: Object.keys(companySortableFields),
  sort_order: sortOrderType,
};