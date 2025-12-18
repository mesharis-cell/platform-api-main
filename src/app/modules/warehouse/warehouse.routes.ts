import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { WarehouseSchemas } from "./warehouse.schemas";

const router = Router();

router.post(
  "/",
  payloadValidator(WarehouseSchemas.createWarehouse),
);

router.get("/",);

router.get("/:id");

router.put(
  "/:id",
  payloadValidator(WarehouseSchemas.updateWarehouse),
);

router.delete("/:id");

export const WarehouseRoutes = router;
