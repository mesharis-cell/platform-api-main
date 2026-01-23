import { IGenericErrorResponse } from "./../interface/error";
import { ZodError } from "zod";
import { IErrorSources } from "../interface/error";

const zodErrorHandler = (err: ZodError): IGenericErrorResponse => {
    const errorSources: IErrorSources[] = err.issues.map((issue) => ({
        path: issue.path[issue.path.length - 1] as string | number,
        message: issue.message,
    }));
    let message = "Validation error!";
    const statusCode = 400;

    if (errorSources?.length) {
        message = errorSources.map((item) => item.message).join(" | ");
    }

    return {
        statusCode,
        message,
        errorSources,
    };
};

export default zodErrorHandler;
