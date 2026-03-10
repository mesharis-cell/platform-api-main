import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { AttachmentTypesServices } from "./attachment-types.services";

const listAttachmentTypes = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await AttachmentTypesServices.listAttachmentTypes(platformId, user, {
        entity_type: typeof req.query.entity_type === "string" ? req.query.entity_type : undefined,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Attachment types fetched successfully",
        data: result,
    });
});

const createAttachmentType = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const result = await AttachmentTypesServices.createAttachmentType(platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Attachment type created successfully",
        data: result,
    });
});

const updateAttachmentType = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await AttachmentTypesServices.updateAttachmentType(id, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Attachment type updated successfully",
        data: result,
    });
});

export const AttachmentTypesControllers = {
    listAttachmentTypes,
    createAttachmentType,
    updateAttachmentType,
};
