import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { StockMovementsControllers } from "./stock-movements.controllers";
import { StockMovementsSchemas } from "./stock-movements.schemas";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Asset stock history
router.get(
    "/asset/:asset_id/stock-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.STOCK_MOVEMENTS_READ),
    StockMovementsControllers.getAssetStockHistory
);

// Family stock history
router.get(
    "/asset-family/:family_id/stock-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.STOCK_MOVEMENTS_READ),
    StockMovementsControllers.getFamilyStockHistory
);

// Low stock families
router.get(
    "/low-stock",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.STOCK_MOVEMENTS_READ),
    StockMovementsControllers.getLowStockFamilies
);

// Manual stock adjustment
router.post(
    "/manual-adjustment",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.STOCK_MOVEMENTS_ADJUST),
    payloadValidator(StockMovementsSchemas.manualAdjustmentSchema),
    StockMovementsControllers.createManualAdjustment
);

export const StockMovementsRoutes = router;
