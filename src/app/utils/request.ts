import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";

export const getRequiredString = (value: string | string[] | undefined, name: string): string => {
    if (Array.isArray(value)) return value[0];
    if (typeof value === "string" && value.length > 0) return value;
    throw new CustomizedError(httpStatus.BAD_REQUEST, `${name} is required`);
};
