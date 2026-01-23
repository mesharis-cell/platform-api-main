/**
 * Dedicated Order Estimate Controller
 * Better organization for estimate endpoint
 */

import { Request, Response } from "express";
import httpStatus from "http-status";
import CustomizedError from "../../error/customized-error";
import { OrderServices } from "./order.services";

// ----------------------------------- CALCULATE ORDER ESTIMATE -----------------------------------
export const calculateOrderEstimate = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const platformId = (req as any).platform_id;
        const companyId = user.company_id;

        if (!companyId) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
        }

        const { items, venue_city, transport_trip_type } = req.body;

        // Validation
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Items array is required");
        }

        if (!venue_city) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "venue_city is required");
        }

        if (!transport_trip_type) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "transport_trip_type is required");
        }

        if (!["ONE_WAY", "ROUND_TRIP"].includes(transport_trip_type)) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "transport_trip_type must be ONE_WAY or ROUND_TRIP"
            );
        }

        // Calculate estimate
        const estimate = await OrderServices.calculateOrderEstimate(
            platformId,
            companyId,
            items,
            venue_city,
            transport_trip_type
        );

        return res.status(httpStatus.OK).json({
            success: true,
            message: "Estimate calculated successfully",
            data: { estimate },
        });
    } catch (error) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: error instanceof Error ? error.message : "Failed to calculate estimate",
        });
    }
};

export const OrderEstimateController = {
    calculateOrderEstimate,
};
