import { zones } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const zoneSortableFields: Record<string, any> = {
    name: zones.name,
    capacity: zones.capacity,
    created_at: zones.created_at,
    updated_at: zones.updated_at,
};

export const zoneQueryValidationConfig = {
    sort_by: Object.keys(zoneSortableFields),
    sort_order: sortOrderType,
};
