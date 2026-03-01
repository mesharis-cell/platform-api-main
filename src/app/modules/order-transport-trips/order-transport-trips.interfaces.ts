import z from "zod";
import { OrderTransportTripsSchemas } from "./order-transport-trips.schemas";

export type CreateOrderTransportTripPayload = z.infer<
    typeof OrderTransportTripsSchemas.createOrderTransportTripSchema
>["body"] & {
    order_id: string;
    platform_id: string;
    created_by: string;
};

export type UpdateOrderTransportTripPayload = z.infer<
    typeof OrderTransportTripsSchemas.updateOrderTransportTripSchema
>["body"] & {
    updated_by: string;
};
