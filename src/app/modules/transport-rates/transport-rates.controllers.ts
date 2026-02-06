import { Request, Response } from "express";
import httpStatus from "http-status";
import { TransportRatesServices } from "./transport-rates.services";
import queryValidator from "../../utils/query-validator";
import { transportRateQueryValidationConfig } from "./transport-rates.utils";
import sendResponse from "../../shared/send-response";
import catchAsync from "../../shared/catch-async";
import CustomizedError from "../../error/customized-error";

// ----------------------------------- LIST TRANSPORT RATES -----------------------------------
const listTransportRates = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const query = req.query;

    const result = await TransportRatesServices.listTransportRates(query, platformId);

    return res.status(httpStatus.OK).json({
        success: true,
        ...result,
    });
};

// ----------------------------------- GET TRANSPORT RATE BY ID -----------------------------------
const getTransportRateById = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const rate = await TransportRatesServices.getTransportRateById(id as string, platformId);

    return res.status(httpStatus.OK).json({
        success: true,
        data: rate,
    });
};

// ----------------------------------- CREATE TRANSPORT RATE -----------------------------------
const createTransportRate = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const payload = { ...req.body, platform_id: platformId };

    const rate = await TransportRatesServices.createTransportRate(payload);

    return res.status(httpStatus.CREATED).json({
        success: true,
        message: "Transport rate created successfully",
        data: rate,
    });
};

// ----------------------------------- UPDATE TRANSPORT RATE -----------------------------------
const updateTransportRate = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;
    const payload = req.body;

    const rate = await TransportRatesServices.updateTransportRate(
        id as string,
        platformId,
        payload
    );

    return res.status(httpStatus.OK).json({
        success: true,
        message: "Transport rate updated successfully",
        data: rate,
    });
};

// ----------------------------------- DELETE TRANSPORT RATE -----------------------------------
const deleteTransportRate = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    await TransportRatesServices.deleteTransportRate(id as string, platformId);

    return res.status(httpStatus.OK).json({
        success: true,
        message: "Transport rate deactivated successfully",
    });
};

// ----------------------------------- LOOKUP TRANSPORT RATE -----------------------------------
const lookupTransportRate = catchAsync(async (req, res) => {
    // Step 1: Get user and platform
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const companyId = user.company_id;

    // Step 2: Extract query parameters
    const { city, trip_type, vehicle_type } = req.query as Record<string, any>;

    // Step 3: Check for required parameters
    if (!city || !trip_type || !vehicle_type) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "city, trip_type, and vehicle_type query parameters are required");
    }

    // Step 4: Validate specific parameters
    if (trip_type) queryValidator(transportRateQueryValidationConfig, "trip_type", trip_type);

    // Step 5: Retrieve transport rate information
    const result = await TransportRatesServices.lookupTransportRate(
        platformId,
        companyId || null,
        city,
        trip_type,
        vehicle_type
    );

    // Step 6: Send success response
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Estimate calculated successfully.",
        data: result,
    });
});

export const TransportRatesControllers = {
    listTransportRates,
    getTransportRateById,
    createTransportRate,
    updateTransportRate,
    deleteTransportRate,
    lookupTransportRate,
};
