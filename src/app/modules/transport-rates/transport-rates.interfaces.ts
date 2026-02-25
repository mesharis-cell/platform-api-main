import z from "zod";
import { TransportRatesSchemas } from "./transport-rates.schemas";
import { tripTypeEnum } from "../../../db/schema";

export type CreateTransportRatePayload = z.infer<
    typeof TransportRatesSchemas.createTransportRateSchema
>["body"] & {
    platform_id: string;
};

export type UpdateTransportRatePayload = z.infer<
    typeof TransportRatesSchemas.updateTransportRateSchema
>["body"];

export type TripType = (typeof tripTypeEnum.enumValues)[number];

export type TransportRateLookupQuery = {
    city_id: string;
    trip_type: string;
    vehicle_type: string;
};
