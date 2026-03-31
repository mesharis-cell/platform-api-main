import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { CityControllers } from "./city.controllers";
import { citiesSchemas } from "./city.schemas";

const router = Router();

// Create city
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.CITIES_CREATE, PERMISSIONS.CITIES_UPDATE),
    payloadValidator(citiesSchemas.citySchema),
    CityControllers.createCity
);

// Get all cities
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.CITIES_READ, PERMISSIONS.CITIES_UPDATE),
    CityControllers.getCities
);

// Get city by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.CITIES_READ, PERMISSIONS.CITIES_UPDATE),
    CityControllers.getCityById
);

// Update city
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.CITIES_UPDATE),
    payloadValidator(citiesSchemas.citySchema),
    CityControllers.updateCity
);

// Delete city
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.CITIES_DELETE, PERMISSIONS.CITIES_UPDATE),
    CityControllers.deleteCity
);

export const CityRoutes = router;
