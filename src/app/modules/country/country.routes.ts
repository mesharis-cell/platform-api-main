import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { CountryControllers } from "./country.controllers";
import { countriesSchemas } from "./country.schemas";

const router = Router();

// Create country
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.COUNTRIES_CREATE, PERMISSIONS.COUNTRIES_UPDATE),
    payloadValidator(countriesSchemas.countrySchema),
    CountryControllers.createCountry
);

// Get all countries
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.COUNTRIES_READ, PERMISSIONS.COUNTRIES_UPDATE),
    CountryControllers.getCountries
);

// Get country by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.COUNTRIES_READ, PERMISSIONS.COUNTRIES_UPDATE),
    CountryControllers.getCountryById
);

// Update country
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.COUNTRIES_UPDATE),
    payloadValidator(countriesSchemas.countrySchema),
    CountryControllers.updateCountry
);

// Delete country
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.COUNTRIES_DELETE, PERMISSIONS.COUNTRIES_UPDATE),
    CountryControllers.deleteCountry
);

export const CountryRoutes = router;
