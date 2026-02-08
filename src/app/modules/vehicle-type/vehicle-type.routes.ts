import { Router } from "express";
import { VehicleTypeControllers } from "./vehicle-type.controllers";
import platformValidator from "../../middleware/platform-validator";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import { vehicleTypeSchemas } from "./vehicle-type.schema";

const router = Router();

router.get(
  "/",
  platformValidator,
  auth("ADMIN", "LOGISTICS", "CLIENT"),
  VehicleTypeControllers.getVehicleTypes);

// POST / -> createVehicleType
router.post(
  "/",
  platformValidator,
  auth("ADMIN"),
  // payloadValidator(vehicleTypeSchemas.createVehicleType),
  VehicleTypeControllers.createVehicleType
);

// PATCH /:id -> updateVehicleType
router.patch(
  "/:id",
  auth("ADMIN"),
  platformValidator,
  payloadValidator(vehicleTypeSchemas.updateVehicleType),
  VehicleTypeControllers.updateVehicleType
);

export const VehicleTypeRoutes = router;