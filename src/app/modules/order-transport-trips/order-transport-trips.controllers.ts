import { Request, Response } from "express";
import httpStatus from "http-status";
import { getRequiredString } from "../../utils/request";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { OrderTransportTripsServices } from "./order-transport-trips.services";

const listOrderTransportTrips = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const orderId = getRequiredString(req.params.id, "id");

    const result = await OrderTransportTripsServices.listOrderTransportTrips(orderId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order transport trips fetched successfully",
        data: result,
    });
});

const createOrderTransportTrip = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.id, "id");

    const result = await OrderTransportTripsServices.createOrderTransportTrip({
        ...req.body,
        order_id: orderId,
        platform_id: platformId,
        created_by: user.id,
    });

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Order transport trip created successfully",
        data: result,
    });
});

const updateOrderTransportTrip = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const orderId = getRequiredString(req.params.id, "id");
    const tripId = getRequiredString(req.params.tripId, "tripId");

    const result = await OrderTransportTripsServices.updateOrderTransportTrip(
        orderId,
        tripId,
        platformId,
        {
            ...req.body,
            updated_by: user.id,
        }
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order transport trip updated successfully",
        data: result,
    });
});

const deleteOrderTransportTrip = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const orderId = getRequiredString(req.params.id, "id");
    const tripId = getRequiredString(req.params.tripId, "tripId");

    const result = await OrderTransportTripsServices.deleteOrderTransportTrip(
        orderId,
        tripId,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order transport trip deleted successfully",
        data: result,
    });
});

export const OrderTransportTripsControllers = {
    listOrderTransportTrips,
    createOrderTransportTrip,
    updateOrderTransportTrip,
    deleteOrderTransportTrip,
};
