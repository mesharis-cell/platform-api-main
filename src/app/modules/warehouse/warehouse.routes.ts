import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { WarehouseControllers } from "./warehouse.controllers";
import { warehouseSchemas } from "./warehouse.schemas";

const router = Router();

// Create warehouse
router.post(
  "/",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  payloadValidator(warehouseSchemas.warehouseSchema),
  WarehouseControllers.createWarehouse
);

// Get all warehouses
router.get("/", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), WarehouseControllers.getWarehouses);

// Get warehouse by id
router.get("/:id", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), WarehouseControllers.getWarehouseById);

// Update warehouse
router.patch("/:id", platformValidator, auth('ADMIN', 'LOGISTICS'), payloadValidator(warehouseSchemas.updateWarehouseSchema), WarehouseControllers.updateWarehouse);

// Delete warehouse
router.delete("/:id", platformValidator, auth('ADMIN'), WarehouseControllers.deleteWarehouse);

export const WarehouseRoutes = router;
