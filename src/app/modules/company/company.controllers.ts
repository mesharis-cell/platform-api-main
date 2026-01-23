import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CompanyServices } from "./company.services";

// ----------------------------------- CREATE COMPANY -----------------------------------
const createCompany = catchAsync(async (req, res) => {
  // Extract platform ID from middleware
  const platformId = (req as any).platformId;

  // Merge platform ID with request body
  const companyData = {
    ...req.body,
    platform_id: platformId,
  };

  const result = await CompanyServices.createCompany(companyData);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Company created successfully",
    data: result,
  });
});

// ----------------------------------- GET COMPANIES -------------------------------------
const getCompanies = catchAsync(async (req, res) => {
  const platformId = (req as any).platformId;

  const result = await CompanyServices.getCompanies(req.query, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Companies fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

// ----------------------------------- GET COMPANY BY ID --------------------------------
const getCompanyById = catchAsync(async (req, res) => {
  const platformId = (req as any).platformId;
  const user = (req as any).user;
  const { id } = req.params;

  const result = await CompanyServices.getCompanyById(id as string, platformId, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Company fetched successfully",
    data: result,
  });
});

// ----------------------------------- UPDATE COMPANY ---------------------------------------
const updateCompany = catchAsync(async (req, res) => {
  const user = (req as any).user;
  const platformId = (req as any).platformId;
  const { id } = req.params;

  const result = await CompanyServices.updateCompany(id as string, req.body, platformId, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Company updated successfully",
    data: result,
  });
});

// ----------------------------------- DELETE COMPANY ---------------------------------------
const deleteCompany = catchAsync(async (req, res) => {
  const platformId = (req as any).platformId;
  const { id } = req.params;

  const result = await CompanyServices.deleteCompany(id as string, platformId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Company deleted successfully",
    data: result,
  });
});

export const CompanyControllers = {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
};
