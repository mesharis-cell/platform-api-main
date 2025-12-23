import { warehouses } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const warehouseSortableFields: Record<string, any> = {
    name: warehouses.name,
    country: warehouses.country,
    city: warehouses.city,
    created_at: warehouses.created_at,
    updated_at: warehouses.updated_at,
};

export const warehouseQueryValidationConfig = {
    sort_by: Object.keys(warehouseSortableFields),
    sort_order: sortOrderType,
};
