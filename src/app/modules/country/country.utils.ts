import { countries } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const countrySortableFields: Record<string, any> = {
    name: countries.name,
    created_at: countries.created_at,
};

export const countryQueryValidationConfig = {
    sort_by: Object.keys(countrySortableFields),
    sort_order: sortOrderType,
};
