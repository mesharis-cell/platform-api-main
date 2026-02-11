import express from "express";
// import auth from "../../middleware/auth";
import { ExportControllers } from "./export.controllers";
// import platformValidator from "../../middleware/platform-validator";

const router = express.Router();

router.get(
    "/orders",
    // platformValidator,
    // auth("ADMIN", "LOGISTICS", "CLIENT"),
    ExportControllers.exportOrders
);

export const ExportRoutes = router;
