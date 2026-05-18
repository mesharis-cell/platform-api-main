import { NextFunction, Request, Response, Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { AttachmentTypesControllers } from "./attachment-types.controllers";
import { AttachmentTypesSchemas } from "./attachment-types.schemas";

const router = Router();

const requireAttachmentTypeListPermission = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (user?.role === "CLIENT") {
        return next();
    }
    return requirePermission(
        PERMISSIONS.ATTACHMENT_TYPES_READ,
        PERMISSIONS.ATTACHMENT_TYPES_UPDATE
    )(req, res, next);
};

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requireAttachmentTypeListPermission,
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
