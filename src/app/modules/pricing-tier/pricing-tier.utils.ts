import { pricingTiers } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const pricingTierSortableFields: Record<string, any> = {
    country: pricingTiers.country,
    city: pricingTiers.city,
    volume_min: pricingTiers.volume_min,
    volume_max: pricingTiers.volume_max,
    base_price: pricingTiers.base_price,
    created_at: pricingTiers.created_at,
    updated_at: pricingTiers.updated_at,
};

export const pricingTierQueryValidationConfig = {
    sort_by: Object.keys(pricingTierSortableFields),
    sort_order: sortOrderType,
};
