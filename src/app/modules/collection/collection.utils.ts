import { collections } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const collectionSortableFields: Record<string, any> = {
    name: collections.name,
    category: collections.category,
    created_at: collections.created_at,
    updated_at: collections.updated_at,
};

export const collectionQueryValidationConfig = {
    sort_by: Object.keys(collectionSortableFields),
    sort_order: sortOrderType,
};
