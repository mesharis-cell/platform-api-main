import { brands } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const brandSortableFields: Record<string, any> = {
    name: brands.name,
    created_at: brands.created_at,
    updated_at: brands.updated_at,
};

export const brandQueryValidationConfig = {
    sort_by: Object.keys(brandSortableFields),
    sort_order: sortOrderType,
};
