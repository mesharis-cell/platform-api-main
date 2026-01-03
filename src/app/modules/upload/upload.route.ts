import { Router } from "express";
import { UploadController } from "./upload.controller";
import { fileUploader } from "../../middleware/upload";

const router = Router();

router.post("/image", fileUploader.singleUpload.single("file"), UploadController.uploadImageController);

export const UploadRoutes = router;