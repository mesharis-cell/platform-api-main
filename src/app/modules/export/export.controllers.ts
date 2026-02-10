import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import { ExportServices } from "./export.services";

const exportOrders = catchAsync(async (req: Request, res: Response) => {
    // Define filterable fields locally if not exported from order.constants
    const filters = req.query as any;
    // const user = (req as any).user;
    const platformId = "17b317e3-1580-457f-b4f1-4e97d6215ee5" // (req as any).platformId;

    const csvData = await ExportServices.exportOrdersService(filters, platformId);

    // Set headers for file download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="orders.csv"');

    res.status(httpStatus.OK).send(csvData);
});

export const ExportControllers = {
    exportOrders,
};
