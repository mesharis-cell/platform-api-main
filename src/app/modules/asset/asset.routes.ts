import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { fileUploader } from "../../middleware/upload";
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

// Bulk upload assets
router.post(
  "/bulk-upload",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  fileUploader.singleUpload.single('file'),
  AssetControllers.bulkUploadAssets
);

// Add condition history
router.post(
  "/condition/add",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  payloadValidator(AssetSchemas.addConditionHistorySchema),
  AssetControllers.addConditionHistory
);

// Batch availability check
router.post(
  "/batch-availability",
  platformValidator,
  auth('ADMIN', 'LOGISTICS', 'CLIENT'),
  payloadValidator(AssetSchemas.batchAvailabilitySchema),
  AssetControllers.getBatchAvailability
);

// Check availability with date range
router.post(
  "/check-availability",
  platformValidator,
  auth('ADMIN', 'LOGISTICS', 'CLIENT'),
  payloadValidator(AssetSchemas.checkAvailabilitySchema),
  AssetControllers.checkAssetAvailability
);

// Get all assets
router.get("/", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), AssetControllers.getAssets);

// Get asset by id
router.get("/:id", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), AssetControllers.getAssetById);

// Get asset availability stats
router.get("/:id/availability-stats", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), AssetControllers.getAssetAvailabilityStats);

// Get asset scan history
router.get("/:id/scan-history", platformValidator, auth('ADMIN', 'LOGISTICS'), AssetControllers.getAssetScanHistory);

// Update asset
router.patch("/:id", platformValidator, auth('ADMIN', 'LOGISTICS'), payloadValidator(AssetSchemas.updateAssetSchema), AssetControllers.updateAsset);

// Delete asset
router.delete("/:id", platformValidator, auth('ADMIN', 'LOGISTICS'), AssetControllers.deleteAsset);

export const AssetRoutes = router;
