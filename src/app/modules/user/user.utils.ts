import { sortOrderType } from "../../constants/common";

export const userSearchableFields = ["name", "email"];

export const userSortableFields = [
  "id",
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

export const userSelectedFields = {
  id: true,
  name: true,
  email: true,
  contact_number: true,
  role: true,
  status: true,
  profile_pic: true,
  created_at: true,
  updated_at: true,
};
