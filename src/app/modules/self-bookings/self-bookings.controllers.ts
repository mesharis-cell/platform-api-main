import { Request, Response } from "express";
import httpStatus from "http-status";
import { SelfBookingsServices } from "./self-bookings.services";

const createSelfBooking = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await SelfBookingsServices.createSelfBooking(user, platformId, req.body);

    return res.status(httpStatus.CREATED).json({ success: true, data: result });
};

const listSelfBookings = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;

    const result = await SelfBookingsServices.listSelfBookings(req.query as any, platformId);

    return res.status(httpStatus.OK).json({ success: true, ...result });
};

const getSelfBookingById = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;

    const result = await SelfBookingsServices.getSelfBookingById(req.params.id, platformId);

    return res.status(httpStatus.OK).json({ success: true, data: result });
};

const returnScan = async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;

    const result = await SelfBookingsServices.returnScan(req.params.id, platformId, req.body);

    return res.status(httpStatus.OK).json({ success: true, data: result });
};

const cancelSelfBooking = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await SelfBookingsServices.cancelSelfBooking(
        req.params.id,
        platformId,
        user.id,
        req.body
    );

    return res.status(httpStatus.OK).json({ success: true, data: result });
};

export const SelfBookingsControllers = {
    createSelfBooking,
    listSelfBookings,
    getSelfBookingById,
    returnScan,
    cancelSelfBooking,
};
