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

// scanning progress
// router.get(
//   "/inbound/:order_id/progress",
//   platformValidator,
//   auth('ADMIN', 'LOGISTICS'),
//   ScanningControllers.inboundScanProgress
// )

export const ScanningRoutes = router;
