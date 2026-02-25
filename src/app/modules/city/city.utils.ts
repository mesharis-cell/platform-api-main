import { cities } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const citySortableFields: Record<string, any> = {
    name: cities.name,
    created_at: cities.created_at,
};

export const cityQueryValidationConfig = {
    sort_by: Object.keys(citySortableFields),
    sort_order: sortOrderType,
};
