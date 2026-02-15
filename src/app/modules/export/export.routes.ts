import express from "express";
import auth from "../../middleware/auth";
import requirePermission from "../../middleware/permission";
import platformValidator from "../../middleware/platform-validator";
import { PERMISSIONS } from "../../constants/permissions";
import { ExportControllers } from "./export.controllers";

const router = express.Router();

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
    auth("ADMIN", "LOGISTICS"),
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

export const ExportRoutes = router;
