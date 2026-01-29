import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { AnalyticsControllers } from "./analytics.controllers";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Get time series data (ADMIN only)
router.get("/time-series", platformValidator, auth("ADMIN"), AnalyticsControllers.getTimeSeries);

// Get revenue summary (ADMIN only)
router.get(
    "/revenue-summary",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ANALYTICS_VIEW_REVENUE),
    AnalyticsControllers.getRevenueSummary
);

// Get margin summary (ADMIN only)
router.get(
    "/margin-summary",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ANALYTICS_TRACK_MARGIN),
    AnalyticsControllers.getMarginSummary
);

// Get company breakdown (ADMIN only)
router.get(
    "/company-breakdown",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ANALYTICS_FILTER_BY_COMPANY),
    AnalyticsControllers.getCompanyBreakdown
);

export const AnalyticsRoutes = router;
