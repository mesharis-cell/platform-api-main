import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CountryControllers } from "./country.controllers";
import { countriesSchemas } from "./country.schemas";

const router = Router();

// Create country
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(countriesSchemas.countrySchema),
    CountryControllers.createCountry
);

// Get all countries
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    CountryControllers.getCountries
);

// Get country by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    CountryControllers.getCountryById
);

// Update country
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(countriesSchemas.countrySchema),
    CountryControllers.updateCountry
);

// Delete country
router.delete("/:id", platformValidator, auth("ADMIN"), CountryControllers.deleteCountry);

export const CountryRoutes = router;
