import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { SelfBookingsControllers } from "./self-bookings.controllers";
import { SelfBookingsSchemas } from "./self-bookings.schemas";

const router = Router();

router.get("/", platformValidator, auth("ADMIN"), SelfBookingsControllers.listSelfBookings);

router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(SelfBookingsSchemas.createSelfBookingSchema),
    SelfBookingsControllers.createSelfBooking
);

router.get("/:id", platformValidator, auth("ADMIN"), SelfBookingsControllers.getSelfBookingById);

router.post(
    "/:id/return-scan",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(SelfBookingsSchemas.returnScanSchema),
    SelfBookingsControllers.returnScan
);

router.post(
    "/:id/cancel",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(SelfBookingsSchemas.cancelSelfBookingSchema),
    SelfBookingsControllers.cancelSelfBooking
);

export const SelfBookingsRoutes = router;
