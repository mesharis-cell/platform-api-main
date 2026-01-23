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

// ----------------------------------- GET BRANDS -------------------------------------
const getBrands = catchAsync(async (req, res) => {
  const user = (req as any).user;
  const platformId = (req as any).platformId;

  const result = await BrandServices.getBrands(req.query, user, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Brands fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

// ----------------------------------- GET BRAND BY ID --------------------------------
const getBrandById = catchAsync(async (req, res) => {
  const user = (req as any).user;
  const platformId = (req as any).platformId;
  const { id } = req.params;

    const result = await BrandServices.getBrandById(id as string, user, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Brand fetched successfully",
    data: result,
  });
});

// ----------------------------------- UPDATE BRAND ---------------------------------------
const updateBrand = catchAsync(async (req, res) => {
  const user = (req as any).user;
  const platformId = (req as any).platformId;
  const { id } = req.params;

    const result = await BrandServices.updateBrand(id as string, req.body, user, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Brand updated successfully",
    data: result,
  });
});

// ----------------------------------- DELETE BRAND ---------------------------------------
const deleteBrand = catchAsync(async (req, res) => {
  const user = (req as any).user;
  const platformId = (req as any).platformId;
  const { id } = req.params;

    const result = await BrandServices.deleteBrand(id as string, user, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Brand deleted successfully",
    data: result,
  });
});

export const BrandControllers = {
  createBrand,
  getBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
};
