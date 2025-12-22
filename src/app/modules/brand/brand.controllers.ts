import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { BrandServices } from "./brand.services";

// ----------------------------------- CREATE BRAND -----------------------------------
const createBrand = catchAsync(async (req, res) => {
  // Extract platform ID from middleware
  const platformId = (req as any).platformId;
  
  // Merge platform ID with request body
  const brandData = {
    ...req.body,
    platform_id: platformId,
  };
  
  const result = await BrandServices.createBrand(brandData);
  
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Brand created successfully",
    data: result,
  });
});

export const BrandControllers = {
  createBrand,
};
