import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { ScanningControllers } from "./scanning.controllers";
import { ScanningSchemas } from "./scanning.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Inbound scan
router.post(
    "/inbound/:order_id/scan",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_IN),
    payloadValidator(ScanningSchemas.inboundScanSchema),
    ScanningControllers.inboundScan
);

// Get inbound scanning progress
router.get(
    "/inbound/:order_id/progress",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_IN),
    ScanningControllers.getInboundProgress
);

// Complete inbound scan
// router.post(
//     "/inbound/:order_id/complete",
//     platformValidator,
//     auth("ADMIN", "LOGISTICS"),
//     requirePermission(PERMISSIONS.SCANNING_SCAN_IN),
//     ScanningControllers.completeInboundScan
// );

// ================================= OUTBOUND SCANNING =================================

// Scan item outbound
router.post(
    "/outbound/:order_id/scan",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    payloadValidator(ScanningSchemas.outboundScanSchema),
    ScanningControllers.outboundScan
);

// Get outbound scanning progress
router.get(
    "/outbound/:order_id/progress",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    ScanningControllers.getOutboundProgress
);

// Upload truck photos
router.post(
    "/outbound/:order_id/truck-photos",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    payloadValidator(ScanningSchemas.uploadTruckPhotosSchema),
    ScanningControllers.uploadTruckPhotos
);

// Complete outbound scan
router.post(
    "/outbound/:order_id/complete",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    ScanningControllers.completeOutboundScan
);

export const ScanningRoutes = router;
