import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { AnalyticsControllers } from "./analytics.controllers";

const router = Router();

// Get time series data (ADMIN only)
router.get(
    "/time-series",
    platformValidator,
    auth('ADMIN'),
    AnalyticsControllers.getTimeSeries
);

export const AnalyticsRoutes = router;
