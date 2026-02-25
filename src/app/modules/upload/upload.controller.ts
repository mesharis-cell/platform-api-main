import crypto from "crypto";
import catchAsync from "../../shared/catch-async";
import httpStatus from "http-status";
import sendResponse from "../../shared/send-response";
import { uploadImageToS3 } from "../../services/s3.service";
import CustomizedError from "../../error/customized-error";

const buildKey = (companyId: string | undefined, originalname: string, isDraft: boolean) => {
    const rand = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    if (isDraft) return `drafts/${rand}/${originalname}`;
    if (companyId) return `${companyId}/${rand}/${originalname}`;
    return `${rand}/${originalname}`;
};

const uploadImageController = catchAsync(async (req, res) => {
    const file = req.file;
    const companyId = req.body.companyId as string;
    const isDraft = req.query.draft === "true";

    if (!file) throw new CustomizedError(httpStatus.BAD_REQUEST, "No file to upload");

    const fileName = buildKey(companyId, file.originalname, isDraft);
    const imageUrl = await uploadImageToS3(file.buffer, fileName, file.mimetype);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Image uploaded successfully",
        data: { imageUrl },
    });
});

// Multiple images upload controller
const uploadMultipleImagesController = catchAsync(async (req, res) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const companyId = req.body.companyId as string;
    const isDraft = req.query.draft === "true";

    if (!files || !files.files || files.files.length === 0)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "No files to upload");

    const imageUrls = await Promise.all(
        files.files.map(async (file) => {
            const fileName = buildKey(companyId, file.originalname, isDraft);
            return uploadImageToS3(file.buffer, fileName, file.mimetype);
        })
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Images uploaded successfully",
        data: { imageUrls },
    });
});

export const UploadController = {
    uploadImageController,
    uploadMultipleImagesController,
};
