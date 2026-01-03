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

  if (!companyId) {
    throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
  }

  const fileName = `${companyId}/${file.originalname}`;

  const fileUrl = await uploadImageToS3(file.buffer, fileName, file.mimetype);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Image uploaded successfully",
    data: { fileUrl },
  });
});

export const UploadController = {
  uploadImageController,
};
