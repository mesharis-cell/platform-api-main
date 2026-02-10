import express from "express";
import { PriceControllers } from "./price.controllers";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import { PriceSchemas } from "./price.schemas";
import platformValidator from "../../middleware/platform-validator";

const router = express.Router();

router.patch(
    "/transport/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    payloadValidator(PriceSchemas.updatePriceForTransportSchema),
    PriceControllers.updatePriceForTransport
);

export const PriceRoutes = router;
