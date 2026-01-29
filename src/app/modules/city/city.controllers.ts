import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CityServices } from "./city.services";

// ----------------------------------- CREATE CITY -----------------------------------
const createCity = catchAsync(async (req, res) => {
    // Extract platform ID from middleware
    const platformId = (req as any).platformId;

    // Merge platform ID with request body
    const cityData = {
        ...req.body,
        platform_id: platformId,
    };

    const result = await CityServices.createCity(cityData);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "City created successfully",
        data: result,
    });
});

// ----------------------------------- GET CITIES -------------------------------------
const getCities = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await CityServices.getCities(platformId, req.query);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Cities fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET CITY BY ID --------------------------------
const getCityById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await CityServices.getCityById(id as string, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "City fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE CITY ---------------------------------------
const updateCity = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await CityServices.updateCity(id as string, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "City updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE CITY ---------------------------------------
const deleteCity = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await CityServices.deleteCity(id as string, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "City deleted successfully",
        data: result,
    });
});

export const CityControllers = {
    createCity,
    getCities,
    getCityById,
    updateCity,
    deleteCity,
};
