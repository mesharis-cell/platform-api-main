import { ErrorRequestHandler } from "express";
import httpStatus from "http-status";
import { ZodError } from "zod";
import config from "../config";
import zodErrorHandler from "../error/zod-error-handler";
import { IErrorSources } from "../interface/error";

const globalErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
    let statusCode = error.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
    let message = error.message || "Something went wrong!";
    let errorSources: IErrorSources[] = [
        {
            path: "",
            message: error.message || "",
        },
    ];

    const pgError = error.cause || error;

    if (error instanceof ZodError) {
        const simplifiedError = zodErrorHandler(error);
        statusCode = simplifiedError.statusCode;
        message = simplifiedError.message;
        errorSources = simplifiedError.errorSources;
    } else if (pgError.code === "23505") {
        // PostgreSQL unique constraint violation
        statusCode = httpStatus.CONFLICT;
        message = pgError.detail || "Duplicate record detected";
    } else if (pgError.code === "23503") {
        // PostgreSQL foreign key constraint violation
        statusCode = httpStatus.BAD_REQUEST;
        message = "Referenced record does not exist";
    } else if (error.message === "jwt expired") {
        statusCode = httpStatus.UNAUTHORIZED;
        message = "Token has been expired";
    }
    res.status(statusCode).json({
        success: false,
        message: message,
        errorSources,
        stack: config.node_env === "development" ? error.stack : null,
    });
};

export default globalErrorHandler;
