import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { AttachmentsControllers } from "./attachments.controllers";

const router = Router();

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    AttachmentsControllers.deleteAttachment
);

export const AttachmentsRoutes = router;
