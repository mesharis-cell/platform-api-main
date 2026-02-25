import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CompanyDomainServices } from "./company-domain.services";

const listCompanyDomains = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId as string;
    const data = await CompanyDomainServices.listCompanyDomains(platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company domains fetched",
        data,
    });
});

const createCompanyDomain = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId as string;
    const data = await CompanyDomainServices.createCompanyDomain(platformId, req.body);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Company domain created",
        data,
    });
});

const updateCompanyDomain = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId as string;
    const { id } = req.params;
    const data = await CompanyDomainServices.updateCompanyDomain(platformId, id, req.body);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company domain updated",
        data,
    });
});

const deleteCompanyDomain = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId as string;
    const { id } = req.params;
    await CompanyDomainServices.deleteCompanyDomain(platformId, id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company domain deleted",
        data: null,
    });
});

export const CompanyDomainControllers = {
    listCompanyDomains,
    createCompanyDomain,
    updateCompanyDomain,
    deleteCompanyDomain,
};
