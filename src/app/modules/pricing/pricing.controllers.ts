import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { PricingPreviewServices } from "./pricing.services";

// ----------------------------------- ROLE PREVIEW -------------------------------------------
// GET /operations/v1/pricing/:purposeType/:entityId/preview?role=CLIENT|LOGISTICS
// ADMIN-only. Returns the requested role's pricing projection + per-line list
// (byte-for-byte the same functions the live role payloads use) plus the ADMIN
// projection, so the frontend can render edit + preview lenses from one fetch.
const getPricingPreview = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const purposeType = getRequiredString(req.params.purposeType, "purposeType");
    const entityId = getRequiredString(req.params.entityId, "entityId");
    const role = getRequiredString(req.query.role as string | undefined, "role");

    const data = await PricingPreviewServices.getPricingPreview(
        platformId,
        purposeType,
        entityId,
        role
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pricing role preview fetched successfully",
        data,
    });
});

export const PricingPreviewControllers = {
    getPricingPreview,
};
