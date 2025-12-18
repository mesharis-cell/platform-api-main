import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { assetSchemas } from "./asset.schemas";

const router = Router();

// Create asset
router.post(
  "/",
  payloadValidator(assetSchemas.createAssetSchema),
);


/**
 * Batch Asset Availability Check API
 * Validates multiple assets in a single request for cart validation
*/
router.post("/batch-availability");

/**
 * POST /api/assets/bulk-upload - Upload assets in bulk via CSV
 * Permission: assets:create (A2 Staff only)
*/
router.post("/bulk-upload");

/**
 * POST /api/assets/check-availability
 * Check asset availability for specific date range
 * Feedback #4 & #5: Date-based availability with buffer days
*
* Auth: All authenticated users
*/
router.post("/check-availability")

/**
 * Filter Assets by Condition API Route (Phase 12)
 * GET /api/assets/filter-by-condition
*/
router.get("/filter-by-condition")

/**
 * QR Code Generation API Route
 * Phase 3: Asset Management & QR Code Generation
*
* POST /api/assets/qr-code/generate - Generate QR code image from string
*/
router.post("/qr-code/generate");

/**
 * POST /api/assets/upload-image - Upload asset photo
 * Permission: assets:upload_photos (A2 Staff only)
*/
router.post("/upload-image");

// Get all assets
router.get("/")

// Get asset by id
router.get("/:id")

/**
 * GET /api/assets/:id/availability-stats
 * Get real-time availability statistics for an asset
 *
 * Calculates:
 * - Available quantity (not booked, not out, not in maintenance)
 * - Booked quantity (currently reserved for confirmed orders)
 * - Out quantity (currently out for delivery/in use)
 * - In maintenance quantity (items marked as RED condition)
 */
router.get("/:id/availability-stats")

/**
 * GET /api/assets/:assetId/scan-history
 * Retrieve scan history for a specific asset
 *
 * Auth: PMG Admin, A2 Staff (assets:read permission)
 * Phase 11: QR Code Tracking System
 */
router.get("/:id/scan-history")

// Update asset
router.patch("/:id", payloadValidator(assetSchemas.updateAssetSchema));

// Delete asset
router.delete("/:id");

export const AssetRoutes = router;