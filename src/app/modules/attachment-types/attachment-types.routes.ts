import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { AttachmentTypesControllers } from "./attachment-types.controllers";
import { AttachmentTypesSchemas } from "./attachment-types.schemas";

const router = Router();

router.get("/", platformValidator, auth("ADMIN"), AttachmentTypesControllers.listAttachmentTypes);
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(AttachmentTypesSchemas.createAttachmentTypeSchema),
    AttachmentTypesControllers.createAttachmentType
);
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(AttachmentTypesSchemas.updateAttachmentTypeSchema),
    AttachmentTypesControllers.updateAttachmentType
);

export const AttachmentTypesRoutes = router;
