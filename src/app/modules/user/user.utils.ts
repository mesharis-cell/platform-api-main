import httpStatus from "http-status";
import { sortOrderType } from "../../constants/common";
import CustomizedError from "../../error/customized-error";

export const userSortableFields = [
  "name",
  "email",
  "created_at",
  "updated_at",
  "role",
];

export const userQueryValidationConfig = {
  sort_by: userSortableFields,
  sort_order: sortOrderType,
};

export const allowedTemplatesForRole: Record<string, string> = {
  ADMIN: "PLATFORM_ADMIN",
  LOGISTICS: "LOGISTICS_STAFF",
  CLIENT: "CLIENT_USER",
};
