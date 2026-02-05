import { vehicleTypeSchemas } from "./vehicle-type.schema";
import { z } from "zod";

export type CreateVehicleTypePayload = z.infer<typeof vehicleTypeSchemas.createVehicleType>["body"] & {
  platform_id: string;
};

export type UpdateVehicleTypePayload = z.infer<typeof vehicleTypeSchemas.updateVehicleType>["body"] & {
  platform_id: string;
};
