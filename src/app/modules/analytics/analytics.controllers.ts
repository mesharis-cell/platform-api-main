import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { TimeSeriesQuery } from "./analytics.interfaces";
import { AnalyticsServices } from "./analytics.services";

// ----------------------------------- GET REVENUE SUMMARY -----------------------------------------
const getRevenueSummary = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const { company_id, start_date, end_date, time_period } = req.query;

    // Validate timePeriod if provided
    if (time_period && !["month", "quarter", "year"].includes(time_period as string)) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Invalid timePeriod. Must be month, quarter, or year",
            data: null,
        });
    }

    // Validate date range if both provided
    if (start_date && end_date) {
        const start = new Date(start_date as string);
        const end = new Date(end_date as string);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return sendResponse(res, {
                statusCode: httpStatus.BAD_REQUEST,
                success: false,
                message: "Invalid date format. Use ISO 8601 format",
                data: null,
            });
        }

        if (start > end) {
            return sendResponse(res, {
                statusCode: httpStatus.BAD_REQUEST,
                success: false,
                message: "startDate must be before endDate",
                data: null,
            });
        }
    }

    // Get user's accessible companies (for multi-tenancy)
    const userCompanies = user.company_id ? [user.company_id] : ["*"];

    const result = await AnalyticsServices.getRevenueSummary(
        platformId,
        userCompanies,
        company_id as string | undefined,
        start_date as string | undefined,
        end_date as string | undefined,
        time_period as "month" | "quarter" | "year" | undefined
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Revenue summary fetched successfully",
        data: result,
    });
});

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

// ----------------------------------- GET MARGIN SUMMARY -----------------------------------------
const getMarginSummary = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const { company_id, start_date, end_date, time_period } = req.query;

    // Validate timePeriod if provided
    if (time_period && !["month", "quarter", "year"].includes(time_period as string)) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Invalid timePeriod. Must be month, quarter, or year",
            data: null,
        });
    }

    // Validate date range if both provided
    if (start_date && end_date) {
        const start = new Date(start_date as string);
        const end = new Date(end_date as string);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return sendResponse(res, {
                statusCode: httpStatus.BAD_REQUEST,
                success: false,
                message: "Invalid date format. Use ISO 8601 format",
                data: null,
            });
        }

        if (start > end) {
            return sendResponse(res, {
                statusCode: httpStatus.BAD_REQUEST,
                success: false,
                message: "startDate must be before endDate",
                data: null,
            });
        }
    }

    // Get user's accessible companies (for multi-tenancy)
    const userCompanies = user.company_id ? [user.company_id] : ["*"];

    const result = await AnalyticsServices.getMarginSummary(
        platformId,
        userCompanies,
        company_id as string | undefined,
        start_date as string | undefined,
        end_date as string | undefined,
        time_period as "month" | "quarter" | "year" | undefined
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Margin summary fetched successfully",
        data: result,
    });
});

export const AnalyticsControllers = {
    getTimeSeries,
    getRevenueSummary,
    getMarginSummary,
};
