import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import featureValidator from "../../middleware/feature-validator";
import { featureNames } from "../../constants/common";
import { AttachmentsControllers } from "./attachments.controllers";

const router = Router();

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // Item 3: standalone delete was the only attachment route missing a
    // feature-flag gate — closing the asymmetry so flag toggling fully
    // hides the surface area.
    featureValidator(featureNames.enable_attachments),
    AttachmentsControllers.deleteAttachment
);

export const AttachmentsRoutes = router;
