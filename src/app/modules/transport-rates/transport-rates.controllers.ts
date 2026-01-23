import { Request, Response } from "express";
import httpStatus from "http-status";
import { TransportRatesServices } from "./transport-rates.services";

// ----------------------------------- LIST TRANSPORT RATES -----------------------------------
const listTransportRates = async (req: Request, res: Response) => {
    const { platform_id } = req as any;
    const query = req.query;

    const result = await TransportRatesServices.listTransportRates(query, platform_id);

    return res.status(httpStatus.OK).json({
        success: true,
        ...result,
    });
};

// ----------------------------------- GET TRANSPORT RATE BY ID -----------------------------------
const getTransportRateById = async (req: Request, res: Response) => {
    const { platform_id } = req as any;
    const { id } = req.params;

    const rate = await TransportRatesServices.getTransportRateById(id as string, platform_id);

    return res.status(httpStatus.OK).json({
        success: true,
        data: rate,
    });
};

// ----------------------------------- CREATE TRANSPORT RATE -----------------------------------
const createTransportRate = async (req: Request, res: Response) => {
    const { platform_id } = req as any;
    const payload = { ...req.body, platform_id };

    const rate = await TransportRatesServices.createTransportRate(payload);

    return res.status(httpStatus.CREATED).json({
        success: true,
        message: "Transport rate created successfully",
        data: rate,
    });
};

// ----------------------------------- UPDATE TRANSPORT RATE -----------------------------------
const updateTransportRate = async (req: Request, res: Response) => {
    const { platform_id } = req as any;
    const { id } = req.params;
    const payload = req.body;

    const rate = await TransportRatesServices.updateTransportRate(
        id as string,
        platform_id,
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
    const { platform_id } = req as any;
    const { id } = req.params;

    await TransportRatesServices.deleteTransportRate(id as string, platform_id);

    return res.status(httpStatus.OK).json({
        success: true,
        message: "Transport rate deactivated successfully",
    });
};

// ----------------------------------- LOOKUP TRANSPORT RATE -----------------------------------
const lookupTransportRate = async (req: Request, res: Response) => {
    const { platform_id, company_id } = req as any;
    const { emirate, trip_type, vehicle_type } = req.query as any;

    if (!emirate || !trip_type || !vehicle_type) {
        return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            error: "emirate, trip_type, and vehicle_type query parameters are required",
        });
    }

    const rate = await TransportRatesServices.getTransportRate(
        platform_id,
        company_id || null,
        emirate,
        trip_type,
        vehicle_type
    );

    return res.status(httpStatus.OK).json({
        success: true,
        data: {
            emirate,
            trip_type,
            vehicle_type,
            rate,
        },
    });
};

export const TransportRatesControllers = {
    listTransportRates,
    getTransportRateById,
    createTransportRate,
    updateTransportRate,
    deleteTransportRate,
    lookupTransportRate,
};
