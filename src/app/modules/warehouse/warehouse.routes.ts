import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { WarehouseControllers } from "./warehouse.controllers";
import { warehouseSchemas } from "./warehouse.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Create warehouse
router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.WAREHOUSES_CREATE),
    payloadValidator(warehouseSchemas.warehouseSchema),
    WarehouseControllers.createWarehouse
);

// Get all warehouses
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.WAREHOUSES_READ),
    WarehouseControllers.getWarehouses
);

// Get warehouse by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    WarehouseControllers.getWarehouseById
);

// Update warehouse
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.WAREHOUSES_UPDATE),
    payloadValidator(warehouseSchemas.updateWarehouseSchema),
    WarehouseControllers.updateWarehouse
);

// Delete warehouse
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.WAREHOUSES_ARCHIVE),
    WarehouseControllers.deleteWarehouse
);

export const WarehouseRoutes = router;
