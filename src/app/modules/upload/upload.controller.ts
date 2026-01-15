import crypto from "crypto";
import catchAsync from "../../shared/catch-async";
import httpStatus from "http-status";
import sendResponse from "../../shared/send-response";
import { uploadImageToS3, getPresignedUploadUrl } from "../../services/s3.service";
import CustomizedError from "../../error/customized-error";

const uploadImageController = catchAsync(async (req, res) => {
  const file = req.file;
  const companyId = req.body.companyId as string;

  if (!file) {
    throw new CustomizedError(httpStatus.BAD_REQUEST, "No file to upload");
  }

  const fileName = companyId ?
    `${companyId}/${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}/${file.originalname}` :
    `${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}/${file.originalname}`;

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

    const fileName = companyId ?
      `${companyId}/${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}/${file.originalname}` :
      `${Date.now()}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}/${file.originalname}`;
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

// Get presigned URL for direct S3 upload (bypasses Vercel's 4.5MB limit)
const getPresignedUploadUrlController = catchAsync(async (req, res) => {
  const { fileName, contentType, companyId, folder } = req.body;

  if (!fileName || !contentType) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      "fileName and contentType are required"
    );
  }

  // Validate content type is an image
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(contentType)) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      `Invalid content type. Allowed: ${allowedTypes.join(', ')}`
    );
  }

  const result = await getPresignedUploadUrl(
    fileName,
    contentType,
    folder || 'images',
    companyId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Presigned upload URL generated successfully",
    data: result,
  });
});

// Get presigned URLs for multiple files
const getPresignedUploadUrlsController = catchAsync(async (req, res) => {
  const { files, companyId, folder } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      "files array is required with fileName and contentType for each file"
    );
  }

  if (files.length > 10) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      "Maximum 10 files allowed per request"
    );
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

  const results = await Promise.all(
    files.map(async (file: { fileName: string; contentType: string }) => {
      if (!file.fileName || !file.contentType) {
        throw new CustomizedError(
          httpStatus.BAD_REQUEST,
          "Each file must have fileName and contentType"
        );
      }

      if (!allowedTypes.includes(file.contentType)) {
        throw new CustomizedError(
          httpStatus.BAD_REQUEST,
          `Invalid content type for ${file.fileName}. Allowed: ${allowedTypes.join(', ')}`
        );
      }

      return getPresignedUploadUrl(
        file.fileName,
        file.contentType,
        folder || 'images',
        companyId
      );
    })
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Presigned upload URLs generated successfully",
    data: { uploads: results },
  });
});

export const UploadController = {
  uploadImageController,
  uploadMultipleImagesController,
  getPresignedUploadUrlController,
  getPresignedUploadUrlsController,
};
