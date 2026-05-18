import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import CustomizedError from "../../error/customized-error";
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
    const { company_id, asset_id, include_inactive } = req.query as Record<
        string,
        string | undefined
    >;
    const result = await CommerceRulesServices.listCommerceRules(platformId, {
        company_id,
        asset_id,
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

const listAcknowledgements = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const { entity_type, entity_id } = req.query as Record<string, string | undefined>;
    if (entity_type !== "ORDER" && entity_type !== "SELF_PICKUP") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "entity_type must be ORDER or SELF_PICKUP"
        );
    }
    if (!entity_id) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "entity_id is required");
    }
    const result = await CommerceRulesServices.listAcknowledgements(platformId, {
        entity_type,
        entity_id,
    });
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Commerce rule acknowledgements fetched",
        data: result,
    });
});

export const CommerceRulesControllers = {
    create,
    list,
    update,
    remove,
    evaluate,
    listAcknowledgements,
};
