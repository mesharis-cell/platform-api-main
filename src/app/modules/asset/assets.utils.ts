import { assets } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const assetSortableFields: Record<string, any> = {
    name: assets.name,
    category: assets.category,
    condition: assets.condition,
    status: assets.status,
    created_at: assets.created_at,
    updated_at: assets.updated_at,
};

export const assetQueryValidationConfig = {
    sort_by: Object.keys(assetSortableFields),
    sort_order: sortOrderType,
};

