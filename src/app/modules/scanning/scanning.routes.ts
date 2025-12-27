import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { ScanningControllers } from "./scanning.controllers";
import { ScanningSchemas } from "./scanning.schemas";

const router = Router();

// Inbound scan
router.post(
  "/inbound/:order_id/scan",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  payloadValidator(ScanningSchemas.inboundScanSchema),
  ScanningControllers.inboundScan
);

// Get inbound scanning progress
router.get(
  "/inbound/:order_id/progress",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  ScanningControllers.getInboundProgress
);

// Complete inbound scan
router.post(
  "/inbound/:order_id/complete",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  ScanningControllers.completeInboundScan
);

// ================================= OUTBOUND SCANNING =================================

// Scan item outbound
router.post(
  "/outbound/:order_id/scan",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  payloadValidator(ScanningSchemas.outboundScanSchema),
  ScanningControllers.outboundScan
);

export const ScanningRoutes = router;
