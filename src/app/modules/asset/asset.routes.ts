import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { AssetSchemas } from "./asset.schemas";
import { AssetControllers } from "./assets.controllers";

const router = Router();

// Create asset
router.post(
  "/",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  payloadValidator(AssetSchemas.createAssetSchema),
  AssetControllers.createAsset
);

// Get all assets
router.get("/", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), AssetControllers.getAssets);

// Get asset by id
router.get("/:id", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), AssetControllers.getAssetById);

// Update asset
router.patch("/:id", platformValidator, auth('ADMIN', 'LOGISTICS'), payloadValidator(AssetSchemas.updateAssetSchema), AssetControllers.updateAsset);

// Delete asset
router.delete("/:id", platformValidator, auth('ADMIN', 'LOGISTICS'), AssetControllers.deleteAsset);

export const AssetRoutes = router;
