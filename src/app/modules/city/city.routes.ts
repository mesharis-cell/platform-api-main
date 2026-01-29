import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CityControllers } from "./city.controllers";
import { citiesSchemas } from "./city.schemas";

const router = Router();

// Create city
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(citiesSchemas.citySchema),
    CityControllers.createCity
);

// Get all cities
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    CityControllers.getCities
);

// Get city by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    CityControllers.getCityById
);

// Update city
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(citiesSchemas.citySchema),
    CityControllers.updateCity
);

// Delete city
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    CityControllers.deleteCity
);

export const CityRoutes = router;
