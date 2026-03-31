import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { AttachmentTypesControllers } from "./attachment-types.controllers";
import { AttachmentTypesSchemas } from "./attachment-types.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ATTACHMENT_TYPES_READ, PERMISSIONS.ATTACHMENT_TYPES_UPDATE),
    AttachmentTypesControllers.listAttachmentTypes
);
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ATTACHMENT_TYPES_UPDATE),
    payloadValidator(AttachmentTypesSchemas.createAttachmentTypeSchema),
    AttachmentTypesControllers.createAttachmentType
);
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ATTACHMENT_TYPES_UPDATE),
    payloadValidator(AttachmentTypesSchemas.updateAttachmentTypeSchema),
    AttachmentTypesControllers.updateAttachmentType
);

export const AttachmentTypesRoutes = router;
