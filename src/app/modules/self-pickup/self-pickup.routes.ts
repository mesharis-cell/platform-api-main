import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import featureValidator from "../../middleware/feature-validator";
import { SelfPickupControllers } from "./self-pickup.controllers";
import { SelfPickupSchemas } from "./self-pickup.schemas";
import { AttachmentsControllers } from "../attachments/attachments.controllers";
import { AttachmentsSchemas } from "../attachments/attachments.schemas";
import { WorkflowRequestControllers } from "../workflow-request/workflow-request.controllers";
import { WorkflowRequestSchemas } from "../workflow-request/workflow-request.schemas";
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
        payloadValidator(SelfPickupSchemas.approveQuoteSchema),
        SelfPickupControllers.clientApproveQuote
    );

    router.post(
        "/:id/decline-quote",
        platformValidator,
        auth("CLIENT"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_CREATE),
        featureValidator(featureNames.enable_self_pickup),
        payloadValidator(SelfPickupSchemas.declineQuoteSchema),
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
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_APPROVE),
        featureValidator(featureNames.enable_self_pickup),
        payloadValidator(SelfPickupSchemas.adminApproveQuoteSchema),
        SelfPickupControllers.approveQuote
    );

    router.post(
        "/:id/return-to-logistics",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_APPROVE),
        featureValidator(featureNames.enable_self_pickup),
        payloadValidator(SelfPickupSchemas.returnToLogisticsSchema),
        SelfPickupControllers.returnToLogistics
    );

    router.post(
        "/:id/mark-no-cost",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        requirePermission(PERMISSIONS.SELF_PICKUPS_MARK_NO_COST),
        featureValidator(featureNames.enable_self_pickup),
        SelfPickupControllers.markAsNoCost
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

    router.get(
        "/:id/attachments",
        platformValidator,
        auth("ADMIN", "LOGISTICS", "CLIENT"),
        featureValidator(featureNames.enable_attachments),
        AttachmentsControllers.listForEntity("SELF_PICKUP")
    );

    router.post(
        "/:id/attachments",
        platformValidator,
        auth("ADMIN", "LOGISTICS", "CLIENT"),
        featureValidator(featureNames.enable_attachments),
        payloadValidator(AttachmentsSchemas.createEntityAttachmentsSchema),
        AttachmentsControllers.createForEntity("SELF_PICKUP")
    );

    router.get(
        "/:id/workflow-requests",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        featureValidator(featureNames.enable_workflows),
        WorkflowRequestControllers.listForEntity("SELF_PICKUP")
    );

    router.post(
        "/:id/workflow-requests",
        platformValidator,
        auth("ADMIN", "LOGISTICS"),
        featureValidator(featureNames.enable_workflows),
        payloadValidator(WorkflowRequestSchemas.createWorkflowRequestSchema),
        WorkflowRequestControllers.createForEntity("SELF_PICKUP")
    );

    return router;
})();
