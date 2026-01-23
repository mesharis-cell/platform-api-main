import { Response } from "express";

export type TMeta = {
    total?: number;
    limit?: number;
    page?: number;
    [key: string]: any;
};

export type TJsonData<T> = {
    statusCode: number;
    success: boolean;
    message: string;
    meta?: TMeta;
    data: T | null | undefined;
};

const sendResponse = <T>(res: Response, jsonData: TJsonData<T>) => {
    res.status(jsonData?.statusCode).json({
        success: jsonData?.success,
        message: jsonData?.message,
        meta: jsonData?.meta || null || undefined,
        data: jsonData?.data,
    });
};

export default sendResponse;
