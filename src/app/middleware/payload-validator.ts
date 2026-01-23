import { NextFunction, Request, Response } from "express";
import { ZodObject } from "zod";

const payloadValidator = (schema: ZodObject) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.parseAsync({
                body: req.body,
            });
            next();
        } catch (error) {
            next(error);
        }
    };
};

export default payloadValidator;
