import { Router } from "express";
import { VehicleTypeControllers } from "./vehicle-type.controllers";
import platformValidator from "../../middleware/platform-validator";
import auth from "../../middleware/auth";

const router = Router();

router.get(
  "/",
  platformValidator,
  auth("ADMIN", "LOGISTICS", "CLIENT"),
  VehicleTypeControllers.getVehicleTypes);

router.post(
  "/",
  platformValidator,
  auth("ADMIN"),
  VehicleTypeControllers.createVehicleType);

router.put(
  "/:id",
  platformValidator,
  auth("ADMIN"),
  VehicleTypeControllers.updateVehicleType);

export const VehicleTypeRoutes = router;