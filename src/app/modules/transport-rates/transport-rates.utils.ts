import { tripTypeEnum } from "../../../db/schema";

// Query validation configuration
export const transportRateQueryValidationConfig = {
    trip_type: tripTypeEnum.enumValues,
};