import { tripTypeEnum, vehicleTypeEnum } from "../../../db/schema";

// Query validation configuration
export const transportRateQueryValidationConfig = {
    trip_type: tripTypeEnum.enumValues,
    vehicle_type: vehicleTypeEnum.enumValues,
};