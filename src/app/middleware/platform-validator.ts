import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { uuidRegex } from "../constants/common";
import CustomizedError from "../error/customized-error";

const platformValidator = (req: Request, res: Response, next: NextFunction) => {
  const platformId = req.headers["x-platform"] as string;

  // Check if platform ID exists
  if (!platformId) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      "Platform ID is required. Please provide 'x-platform' header."
    );
  }

  // Validate UUID format
  
  if (!uuidRegex.test(platformId)) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      "Invalid Platform ID format. Must be a valid UUID."
    );
  }

  // Attach platform ID to request object for easy access
  (req as any).platformId = platformId;

  next();
};

export default platformValidator;
