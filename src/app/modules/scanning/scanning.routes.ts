import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { ScanningControllers } from "./scanning.controllers";
import { SelfPickupScanningControllers } from "./self-pickup-scanning.controllers";
import { ScanningSchemas } from "./scanning.schemas";
import requirePermission from "../../middleware/permission";
import featureValidator from "../../middleware/feature-validator";
import { PERMISSIONS } from "../../constants/permissions";
import { featureNames } from "../../constants/common";

const router = Router();

// Inbound scan
router.post(
    "/inbound/:order_id/scan",
    platformValidator,
    auth("LOGISTICS"),
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

// Complete inbound scan (accepts optional settlements[] for pooled items)
router.post(
    "/inbound/:order_id/complete",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_IN),
    payloadValidator(ScanningSchemas.completeInboundScanSchema),
    ScanningControllers.completeInboundScan
);

// ================================= OUTBOUND SCANNING =================================

// Scan item outbound
router.post(
    "/outbound/:order_id/scan",
    platformValidator,
    auth("LOGISTICS"),
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
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    payloadValidator(ScanningSchemas.uploadTruckPhotosSchema),
    ScanningControllers.uploadTruckPhotos
);

// Complete outbound scan
router.post(
    "/outbound/:order_id/complete",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    ScanningControllers.completeOutboundScan
);

// ================================= SELF-PICKUP SCANNING =================================

// Handover scan (outbound from warehouse to collector)
router.post(
    "/self-pickup-handover/:self_pickup_id/scan",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    featureValidator(featureNames.enable_self_pickup),
    payloadValidator(ScanningSchemas.outboundScanSchema),
    SelfPickupScanningControllers.handoverScan
);

router.get(
    "/self-pickup-handover/:self_pickup_id/progress",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    featureValidator(featureNames.enable_self_pickup),
    SelfPickupScanningControllers.getHandoverProgress
);

router.post(
    "/self-pickup-handover/:self_pickup_id/complete",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    featureValidator(featureNames.enable_self_pickup),
    payloadValidator(ScanningSchemas.completeSelfPickupHandoverSchema),
    SelfPickupScanningControllers.completeHandover
);

// Mid-flow add item — F3 per plan `sp-partial-scan-skip-add.md`.
// NO_COST-only, CONFIRMED or READY_FOR_PICKUP only; service enforces both.
// Admin gets the same capability as logistics because an admin on-site may
// need to unstick the flow too.
router.post(
    "/self-pickup-handover/:self_pickup_id/add-item",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_OUT),
    featureValidator(featureNames.enable_self_pickup),
    payloadValidator(ScanningSchemas.addSelfPickupItemMidflowSchema),
    SelfPickupScanningControllers.addItemMidflow
);

// Return scan (inbound from collector back to warehouse)
router.post(
    "/self-pickup-return/:self_pickup_id/scan",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_IN),
    featureValidator(featureNames.enable_self_pickup),
    payloadValidator(ScanningSchemas.selfPickupReturnScanSchema),
    SelfPickupScanningControllers.returnScan
);

router.get(
    "/self-pickup-return/:self_pickup_id/progress",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_IN),
    featureValidator(featureNames.enable_self_pickup),
    SelfPickupScanningControllers.getReturnProgress
);

router.post(
    "/self-pickup-return/:self_pickup_id/complete",
    platformValidator,
    auth("LOGISTICS"),
    requirePermission(PERMISSIONS.SCANNING_SCAN_IN),
    featureValidator(featureNames.enable_self_pickup),
    payloadValidator(ScanningSchemas.completeInboundScanSchema),
    SelfPickupScanningControllers.completeReturn
);

export const ScanningRoutes = router;
