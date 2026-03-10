import { sortOrderType } from "../../constants/common";

export const userSortableFields = ["name", "email", "created_at", "updated_at", "role"];

export const userQueryValidationConfig = {
    sort_by: userSortableFields,
    sort_order: sortOrderType,
};
