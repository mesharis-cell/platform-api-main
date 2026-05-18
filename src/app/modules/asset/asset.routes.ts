import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { AssetSchemas } from "./asset.schemas";
import { AssetControllers } from "./assets.controllers";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import featureValidator from "../../middleware/feature-validator";
import { featureNames } from "../../constants/common";

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

// Bulk upload assets //
router.post(
    "/bulk-upload",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    featureValidator(featureNames.enable_asset_bulk_upload),
    requirePermission(PERMISSIONS.ASSETS_BULK_UPLOAD),
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

// Unified availability check (replaces /batch-availability + /check-availability).
// Takes optional window + optional per-item quantities. See availability.core.ts
// for the math that drives it.
router.post(
    "/availability",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_CHECK_AVAILABILITY, PERMISSIONS.ORDERS_CREATE),
    payloadValidator(AssetSchemas.availabilitySchema),
    AssetControllers.getAvailability
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
    requirePermission(PERMISSIONS.ASSETS_AVAILABILITY_STATS),
    AssetControllers.getAssetAvailabilityStats
);

// Get asset scan history
router.get(
    "/:id/scan-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_SCAN_HISTORY),
    AssetControllers.getAssetScanHistory
);

// Get asset versions
router.get(
    "/:id/versions",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    AssetControllers.getAssetVersions
);

// Get asset order history (bookings + scan events + derig captures)
router.get(
    "/:id/order-history",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    AssetControllers.getAssetOrderHistory
);

// Get asset usage report (orders + scanning + service requests + condition timeline)
router.get(
    "/:id/usage-report",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    AssetControllers.getAssetUsageReport
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

// Update asset condition through the dedicated condition workflow.
router.patch(
    "/:id/condition",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.CONDITIONS_UPDATE),
    payloadValidator(AssetSchemas.updateAssetConditionSchema),
    AssetControllers.updateAssetCondition
);

// Add units to a SERIALIZED asset (creates new unit rows with unique QR codes).
// Promotes a raw asset into a group if the source has group_id IS NULL.
router.post(
    "/:id/add-units",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    payloadValidator(AssetSchemas.addAssetUnitsSchema),
    AssetControllers.addAssetUnits
);

// Bulk-group N selected assets under one group_id. Validates same
// company+brand+stock_mode across selections; rejects cross-group conflicts.
router.post(
    "/bulk-group",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    payloadValidator(AssetSchemas.bulkGroupAssetsSchema),
    AssetControllers.bulkGroupAssets
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
