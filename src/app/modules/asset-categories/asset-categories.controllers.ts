import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { AssetCategoryServices } from "./asset-categories.services";
import { AuthUser } from "../../interface/common";

const listCategories = catchAsync(async (req, res) => {
    const platformId = req.headers["x-platform"] as string;
    const user = (req as any).user as AuthUser;
    const companyId = req.query.company_id as string | undefined;

    const result = await AssetCategoryServices.listCategories(
        platformId,
        companyId || user.company_id || undefined
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset categories fetched",
        data: result,
    });
});

const createCategory = catchAsync(async (req, res) => {
    const platformId = req.headers["x-platform"] as string;
    const user = (req as any).user as AuthUser;

    const result = await AssetCategoryServices.createCategory(
        platformId,
        req.body,
        user.id
    );

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Asset category created",
        data: result,
    });
});

const updateCategory = catchAsync(async (req, res) => {
    const platformId = req.headers["x-platform"] as string;
    const id = req.params.id;

    const result = await AssetCategoryServices.updateCategory(
        id,
        platformId,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset category updated",
        data: result,
    });
});

const deleteCategory = catchAsync(async (req, res) => {
    const platformId = req.headers["x-platform"] as string;
    const id = req.params.id;

    await AssetCategoryServices.deleteCategory(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset category deleted",
        data: null,
    });
});

export const AssetCategoryControllers = {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
};
