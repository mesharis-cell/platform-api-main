import { NextFunction, Request, Response } from "express";
import { ZodObject } from "zod";

const payloadValidator = (schema: ZodObject) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            // Write transformed values back so downstream handlers receive coerced types
            if (parsed.body !== undefined) req.body = parsed.body;
            if (parsed.query !== undefined) req.query = parsed.query as any;
            if (parsed.params !== undefined) req.params = parsed.params as Record<string, string>;
            next();
        } catch (error) {
            next(error);
        }
    };
};

export default payloadValidator;
