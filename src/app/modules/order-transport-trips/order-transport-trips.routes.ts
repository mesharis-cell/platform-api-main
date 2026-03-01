import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { OrderTransportTripsControllers } from "./order-transport-trips.controllers";
import { OrderTransportTripsSchemas } from "./order-transport-trips.schemas";

const router = Router();

router.get(
    "/:id/transport-trips",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    OrderTransportTripsControllers.listOrderTransportTrips
);

router.post(
    "/:id/transport-trips",
    platformValidator,
    auth("LOGISTICS"),
    payloadValidator(OrderTransportTripsSchemas.createOrderTransportTripSchema),
    OrderTransportTripsControllers.createOrderTransportTrip
);

router.patch(
    "/:id/transport-trips/:tripId",
    platformValidator,
    auth("LOGISTICS"),
    payloadValidator(OrderTransportTripsSchemas.updateOrderTransportTripSchema),
    OrderTransportTripsControllers.updateOrderTransportTrip
);

router.delete(
    "/:id/transport-trips/:tripId",
    platformValidator,
    auth("LOGISTICS"),
    OrderTransportTripsControllers.deleteOrderTransportTrip
);

export const OrderTransportTripsRoutes = router;
