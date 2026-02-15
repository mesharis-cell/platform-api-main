import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { ReskinRequestsControllers } from "./reskin-requests.controllers";
import { ReskinRequestsSchemas } from "./reskin-requests.schemas";

const router = Router({ mergeParams: true }); // mergeParams to access :orderId

// List reskin requests for an order
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    ReskinRequestsControllers.listReskinRequests
);

// Process reskin request (Admin/Logistics - creates reskin record + pricing line)
router.post(
    "/:orderItemId/process",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.RESKIN_REQUESTS_PROCESS),
    payloadValidator(ReskinRequestsSchemas.processReskinRequestSchema),
    ReskinRequestsControllers.processReskinRequest
);

// Complete reskin request (Admin/Logistics - marks fabrication complete)
router.post(
    "/:reskinId/complete",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.RESKIN_REQUESTS_COMPLETE),
    payloadValidator(ReskinRequestsSchemas.completeReskinRequestSchema),
    ReskinRequestsControllers.completeReskinRequest
);

// Cancel reskin request (Admin only - voids line item, optional order cancellation)
router.post(
    "/:reskinId/cancel",
    platformValidator,
    auth("ADMIN"),
    // requirePermission(PERMISSIONS.RESKIN_REQUESTS_CANCEL),
    payloadValidator(ReskinRequestsSchemas.cancelReskinRequestSchema),
    ReskinRequestsControllers.cancelReskinRequest
);

export const ReskinRequestsRoutes = router;
