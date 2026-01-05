import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { TimeSeriesQuery } from "./analytics.interfaces";
import { AnalyticsServices } from "./analytics.services";

// ----------------------------------- GET TIME SERIES -----------------------------------
const getTimeSeries = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await AnalyticsServices.getTimeSeries(
        req.query as unknown as TimeSeriesQuery,
        user,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Time series data fetched successfully",
        data: result,
    });
});

export const AnalyticsControllers = {
    getTimeSeries,
};
