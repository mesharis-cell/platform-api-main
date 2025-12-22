import { sortOrderType } from "../../constants/common";

export const brandSortableFields = [
    "name",
    "created_at",
    "updated_at"
];

export const brandQueryValidationConfig = {
    sort_by: brandSortableFields,
    sort_order: sortOrderType,
};