import { sortOrderType } from "../../constants/common";

export const companySortableFields = [
  "name",
  "domain",
  "createdAt",
  "updatedAt"
];

export const companyQueryValidationConfig = {
  sort_by: companySortableFields,
  sort_order: sortOrderType,
};