import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CountryServices } from "./country.services";

// ----------------------------------- CREATE COUNTRY -----------------------------------
const createCountry = catchAsync(async (req, res) => {
    // Extract platform ID from middleware
    const platformId = (req as any).platformId;

    // Merge platform ID with request body
    const countryData = {
        ...req.body,
        platform_id: platformId,
    };

    const result = await CountryServices.createCountry(countryData);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Country created successfully",
        data: result,
    });
});

// ----------------------------------- GET COUNTRIES -------------------------------------
const getCountries = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await CountryServices.getCountries(platformId, req.query);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Countries fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET COUNTRY BY ID --------------------------------
const getCountryById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await CountryServices.getCountryById(id as string, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Country fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE COUNTRY ---------------------------------------
const updateCountry = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await CountryServices.updateCountry(id as string, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Country updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE COUNTRY ---------------------------------------
const deleteCountry = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await CountryServices.deleteCountry(id as string, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Country deleted successfully",
        data: result,
    });
});

export const CountryControllers = {
    createCountry,
    getCountries,
    getCountryById,
    updateCountry,
    deleteCountry,
};
