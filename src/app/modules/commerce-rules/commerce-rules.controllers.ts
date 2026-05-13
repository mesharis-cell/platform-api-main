import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { CommerceRulesServices } from "./commerce-rules.services";

const create = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const result = await CommerceRulesServices.createCommerceRule(req.body, platformId);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Commerce rule created",
        data: result,
    });
});

const list = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const { company_id, asset_id, group_id, include_inactive } = req.query as Record<
        string,
        string | undefined
    >;
    const result = await CommerceRulesServices.listCommerceRules(platformId, {
        company_id,
        asset_id,
        group_id,
        include_inactive: include_inactive === "true",
    });
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Commerce rules fetched",
        data: result,
    });
});

const update = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await CommerceRulesServices.updateCommerceRule(id, req.body, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Commerce rule updated",
        data: result,
    });
});

const remove = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await CommerceRulesServices.deleteCommerceRule(id, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Commerce rule deleted",
        data: result,
    });
});

const evaluate = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await CommerceRulesServices.evaluateCart(req.body, user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Commerce rules evaluated",
        data: result,
    });
});

export const CommerceRulesControllers = {
    create,
    list,
    update,
    remove,
    evaluate,
};
