import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import featureValidator from "../../middleware/feature-validator";
import { SelfPickupControllers } from "./self-pickup.controllers";
import { SelfPickupSchemas } from "./self-pickup.schemas";
import { PERMISSIONS } from "../../constants/permissions";
import { featureNames } from "../../constants/common";

// ================================= CLIENT ROUTES =========================================
// Mounted under /client/v1/self-pickup

export const SelfPickupClientRoutes = (() => {
    const router = Router();

    router.post(
        "/submit-from-cart",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_CREATE),
        featureValidator(featureNames.enable_self_pickup),
        payloadValidator(SelfPickupSchemas.submitSelfPickupSchema),
        SelfPickupControllers.submitFromCart
    );

    router.get(
        "/my",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_READ),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.clientList
    );

    router.get(
        "/:id",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_READ),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.clientDetail
    );

    router.post(
        "/:id/approve-quote",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_CREATE),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.clientApproveQuote
    );

    router.post(
        "/:id/decline-quote",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_CREATE),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.clientDeclineQuote
    );

    router.post(
        "/:id/trigger-return",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_CREATE),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.clientTriggerReturn
    );

    router.post(
        "/:id/cancel",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_CANCEL),
        featureValidator(featureNames.enable_self_pickup),
        payloadValidator(SelfPickupSchemas.cancelSelfPickupSchema),
        SelfPickupControllers.clientCancel
    );

    return router;
})();

// ================================= OPERATIONS ROUTES =====================================
// Mounted under /operations/v1/self-pickup

export const SelfPickupOperationRoutes = (() => {
    const router = Router();

    router.get(
        "/",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_READ),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.adminList
    );

    router.get(
        "/:id",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_READ),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.adminDetail
    );

    router.get(
        "/:id/status-history",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_READ),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.getStatusHistory
    );

    router.post(
        "/:id/submit-for-approval",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_APPROVE),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.submitForApproval
    );

    router.post(
        "/:id/approve",
        platformValidator,
        auth("ADMIN"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_APPROVE),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.approveQuote
    );

    router.post(
        "/:id/ready-for-pickup",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_APPROVE),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.markReadyForPickup
    );

    router.post(
        "/:id/cancel",
        platformValidator,
        auth("ADMIN"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_CANCEL),
        featureValidator(featureNames.enable_self_pickup),
        payloadValidator(SelfPickupSchemas.cancelSelfPickupSchema),
        SelfPickupControllers.adminCancel
    );

    router.patch(
        "/:id/job-number",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_APPROVE),
        featureValidator(featureNames.enable_self_pickup),
        payloadValidator(SelfPickupSchemas.updateJobNumberSchema),
        SelfPickupControllers.updateJobNumber
    );

    return router;
})();
