import express from "express";
import auth from "../../middleware/auth";
import requirePermission from "../../middleware/permission";
import platformValidator from "../../middleware/platform-validator";
import { PERMISSIONS } from "../../constants/permissions";
import { ExportControllers } from "./export.controllers";

const router = express.Router();

// TEMPORARY (hotfix/disable-reports-export): every report/export endpoint is
// disabled pending the reports-system rebuild. This closes a client-facing
// margin/cost leak — GET /export/orders (the client "My Orders" CSV) served the
// ADMIN pricing projection (margin % + buy-side base-ops) to CLIENT callers
// because exportOrdersService hardcodes projectByRole(..., "ADMIN"). The
// catch-all below short-circuits the whole router for every method/path; the
// route handlers beneath remain only so the diff stays minimal and reviewable.
// Remove this block (or delete the module) once the new /reports module ships.
router.use((_req, res) => {
    res.status(404).json({
        success: false,
        message: "Reporting is temporarily unavailable.",
    });
});

router.get(
    "/orders",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportOrders
);

router.get(
    "/order-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportOrderHistory
);

router.get(
    "/accounts-reconciliation",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportAccountsReconciliation
);

router.get(
    "/stock-report",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    ExportControllers.exportStockReport
);

router.get(
    "/stock-movements",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.STOCK_MOVEMENTS_READ),
    ExportControllers.exportStockMovements
);

router.get(
    "/assets-out",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    ExportControllers.exportAssetsOut
);

router.get(
    "/inbound-log",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportInboundLog
);

router.get(
    "/revenue-report",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ANALYTICS_VIEW_REVENUE, PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportRevenueReport
);

router.get(
    "/cost-report",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportCostReport
);

router.get(
    "/asset-utilization",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    ExportControllers.exportAssetUtilization
);

router.get(
    "/work-summary",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportWorkSummary
);

router.get(
    "/client-issuance-log",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_EXPORT),
    ExportControllers.exportClientIssuanceLog
);

router.get(
    "/asset-catalog",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    ExportControllers.exportAssetCatalog
);

export const ExportRoutes = router;
