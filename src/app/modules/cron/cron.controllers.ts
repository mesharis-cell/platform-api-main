import { Request, Response } from "express";
import httpStatus from "http-status";
import { transitionOrdersOnEventEnd } from "./cron.services";

/**
 * HTTP endpoint handler for event end cron job
 * Can be triggered manually or by external cron services
 */
const handleEventEndCron = async (req: Request, res: Response) => {
    try {
        const result = await transitionOrdersOnEventEnd();

        res.status(httpStatus.OK).json(result);
    } catch (error: any) {
        console.error("❌ Event end cron error:", error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
            error: error.message || "Internal server error",
        });
    }
};

export const CronControllers = {
    handleEventEndCron,
};
