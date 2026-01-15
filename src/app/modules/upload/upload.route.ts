import { Router } from "express";
import { UploadController } from "./upload.controller";
import { fileUploader } from "../../middleware/upload";

const router = Router();

// Traditional upload routes (limited to ~4.5MB on Vercel)
router.post(
  "/image",
  fileUploader.singleUpload.single("file"),
  UploadController.uploadImageController
);
router.post(
  "/images",
  fileUploader.multipleUpload,
  UploadController.uploadMultipleImagesController
);

// Presigned URL routes for direct S3 upload (bypasses Vercel limits - supports any file size)
// Use these for large file uploads
router.post(
  "/presigned-url",
  UploadController.getPresignedUploadUrlController
);
router.post(
  "/presigned-urls",
  UploadController.getPresignedUploadUrlsController
);

export const UploadRoutes = router;