import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { AssetControllers } from "./scanning.controllers";
import { AssetSchemas } from "./scanning.schemas";

const router = Router();

// Create asset
router.post(
  "/",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  payloadValidator(AssetSchemas.createAssetSchema),
  AssetControllers.createAsset
);



export const AssetRoutes = router;
