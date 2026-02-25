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

export const ASSET_REQUIRED_COLUMNS = [
    "platform_id",
    "company_id",
    "warehouse_id",
    "zone_id",
    "name",
    "category",
    "tracking_method",
    "weight_per_unit",
    "dimensions",
    "volume_per_unit",
];

export const ASSET_ALL_COLUMNS = [
    ...ASSET_REQUIRED_COLUMNS,
    "id",
    "brand_id",
    "description",
    "images",
    "total_quantity",
    "available_quantity",
    "packaging",
    "condition",
    "condition_notes",
    "refurb_days_estimate",
    "condition_history",
    "handling_tags",
    "status",
    "last_scanned_at",
    "last_scanned_by",
    "created_at",
    "updated_at",
    "deleted_at",
    "rowNumber",
];
