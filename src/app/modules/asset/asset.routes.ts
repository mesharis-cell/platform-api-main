import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { fileUploader } from "../../middleware/upload";
import { AssetSchemas } from "./asset.schemas";
import { AssetControllers } from "./assets.controllers";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Create asset
router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_CREATE),
    payloadValidator(AssetSchemas.createAssetSchema),
    AssetControllers.createAsset
);

// Bulk upload assets
router.post(
    "/bulk-upload",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    fileUploader.singleUpload.single("file"),
    AssetControllers.bulkUploadAssets
);

// Add condition history
router.post(
    "/add-condition-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.CONDITIONS_UPDATE),
    payloadValidator(AssetSchemas.addConditionHistorySchema),
    AssetControllers.addConditionHistory
);

// Generate QR code
router.post(
    "/generate-qr-code",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_GENERATE_QR),
    payloadValidator(AssetSchemas.generateQRCodeSchema),
    AssetControllers.generateQRCode
);

// Complete maintenance
router.post(
    "/complete-maintenance",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.CONDITIONS_COMPLETE_MAINTENANCE),
    payloadValidator(AssetSchemas.completeMaintenanceSchema),
    AssetControllers.completeMaintenance
);

// Batch availability check
router.post(
    "/batch-availability",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    payloadValidator(AssetSchemas.batchAvailabilitySchema),
    AssetControllers.getBatchAvailability
);

// Check availability with date range
router.post(
    "/check-availability",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    payloadValidator(AssetSchemas.checkAvailabilitySchema),
    AssetControllers.checkAssetAvailability
);

// Get all assets
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_READ, PERMISSIONS.CONDITIONS_VIEW_ITEMS_NEEDING_ATTENTION),
    AssetControllers.getAssets
);

// Get asset by id
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_READ, PERMISSIONS.CONDITIONS_VIEW_HISTORY),
    AssetControllers.getAssetById
);

// Get asset availability stats
router.get(
    "/:id/availability-stats",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    AssetControllers.getAssetAvailabilityStats
);

// Get asset scan history
router.get(
    "/:id/scan-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    AssetControllers.getAssetScanHistory
);

// Update asset
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    payloadValidator(AssetSchemas.updateAssetSchema),
    AssetControllers.updateAsset
);

// Delete asset
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_DELETE),
    AssetControllers.deleteAsset
);

export const AssetRoutes = router;
