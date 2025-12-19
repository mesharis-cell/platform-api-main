import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CompanyServices } from "./company.services";

// ----------------------------------- CREATE COMPANY ---------------------------------
const createCompany = catchAsync(async (req, res, next) => {
  // Extract platform ID from header
  const platformId = (req as any).platformId;
  
  // Merge platform ID with request body
  const companyData = {
    ...req.body,
    platform: platformId,
  };
  
  const result = await CompanyServices.createCompany(companyData);
  
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Company created successfully",
    data: result,
  });
});

// ----------------------------------- GET COMPANIES ----------------------------------
const getCompanies = catchAsync(async (req, res, next) => {
  const platformId = (req as any).platformId;
  const query = req.query;
  
  const result = await CompanyServices.getCompanies(platformId, query);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Companies fetched successfully",
    data: result,
  });
});

export const CompanyControllers = {
    createCompany,
    getCompanies
}
