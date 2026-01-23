import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CatalogServices } from "./catalog.services";

const getCatalog = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const result = await CatalogServices.getCatalog(req.query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Catalog fetched successfully",
        data: result,
    });
});

export const CatalogControllers = {
    getCatalog,
};
