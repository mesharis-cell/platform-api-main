import { sortOrderType } from "../../constants/common";

export const userSortableFields = [
  "name",
  "email",
  "createdAt",
  "updatedAt",
  "role",
];

export const userQueryValidationConfig = {
  sort_by: userSortableFields,
  sort_order: sortOrderType,
};
