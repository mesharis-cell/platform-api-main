import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { AttachmentsServices, AttachmentEntityType } from "./attachments.services";

const listForEntity = (entityType: AttachmentEntityType) =>
    catchAsync(async (req: Request, res: Response) => {
        const platformId = (req as any).platformId;
        const user = (req as any).user;
        const entityId = getRequiredString(req.params.id, "id");
        const result = await AttachmentsServices.listEntityAttachments(
            entityType,
            entityId,
            platformId,
            user
        );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Attachments fetched successfully",
            data: result,
        });
    });

const createForEntity = (entityType: AttachmentEntityType) =>
    catchAsync(async (req: Request, res: Response) => {
        const platformId = (req as any).platformId;
        const user = (req as any).user;
        const entityId = getRequiredString(req.params.id, "id");
        const result = await AttachmentsServices.createEntityAttachments(
            entityType,
            entityId,
            platformId,
            user,
            req.body
        );

        sendResponse(res, {
            statusCode: httpStatus.CREATED,
            success: true,
            message: "Attachments created successfully",
            data: result,
        });
    });

const deleteAttachment = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await AttachmentsServices.deleteAttachment(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Attachment deleted successfully",
        data: result,
    });
});

export const AttachmentsControllers = {
    listForEntity,
    createForEntity,
    deleteAttachment,
};
