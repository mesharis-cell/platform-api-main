import crypto from "crypto";
import catchAsync from "../../shared/catch-async";
import httpStatus from "http-status";
import sendResponse from "../../shared/send-response";
import { uploadImageToS3 } from "../../services/s3.service";
import CustomizedError from "../../error/customized-error";

const uploadImageController = catchAsync(async (req, res) => {
    const file = req.file;
    const companyId = req.body.companyId as string;

    if (!file) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "No file to upload");
    }

    const fileName = companyId
        ? `${companyId}/${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}/${file.originalname}`
        : `${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}/${file.originalname}`;

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

    if (!files || !files.files || files.files.length === 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "No files to upload");
    }

    // Upload all images in parallel
    const uploadPromises = files.files.map(async (file) => {
        const fileName = companyId
            ? `${companyId}/${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}/${file.originalname}`
            : `${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}/${file.originalname}`;
        const imageUrl = await uploadImageToS3(file.buffer, fileName, file.mimetype);
        return imageUrl;
    });

    const imageUrls = await Promise.all(uploadPromises);

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
