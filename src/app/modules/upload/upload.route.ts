import { Router } from "express";
import { UploadController } from "./upload.controller";
import { fileUploader } from "../../middleware/upload";
import platformValidator from "../../middleware/platform-validator";
import auth from "../../middleware/auth";

const router = Router();

router.post(
    "/image",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    fileUploader.singleUpload.single("file"),
    UploadController.uploadImageController
);
router.post(
    "/images",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    fileUploader.multipleUpload,
    UploadController.uploadMultipleImagesController
);
router.post(
    "/documents",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    fileUploader.multipleUpload,
    UploadController.uploadDocumentsController
);

export const UploadRoutes = router;
