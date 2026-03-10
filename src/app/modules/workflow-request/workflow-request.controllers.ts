import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import { WorkflowEntityType, WorkflowRequestServices } from "./workflow-request.services";

const listForEntity = (entityType: WorkflowEntityType) =>
    catchAsync(async (req: Request, res: Response) => {
        const platformId = (req as any).platformId;
        const user = (req as any).user;
        const id = getRequiredString(req.params.id, "id");
        const result = await WorkflowRequestServices.listWorkflowRequestsForEntity(
            entityType,
            id,
            platformId,
            user
        );

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Workflow requests fetched successfully",
            data: result,
        });
    });

const createForEntity = (entityType: WorkflowEntityType) =>
    catchAsync(async (req: Request, res: Response) => {
        const platformId = (req as any).platformId;
        const user = (req as any).user;
        const id = getRequiredString(req.params.id, "id");
        const result = await WorkflowRequestServices.createWorkflowRequest(
            entityType,
            id,
            platformId,
            user,
            req.body
        );

        sendResponse(res, {
            statusCode: httpStatus.CREATED,
            success: true,
            message: "Workflow request created successfully",
            data: result,
        });
    });

const listInbox = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const result = await WorkflowRequestServices.listWorkflowInbox(platformId, user, {
        lifecycle_state:
            typeof req.query.lifecycle_state === "string" ? req.query.lifecycle_state : undefined,
        workflow_code:
            typeof req.query.workflow_code === "string" ? req.query.workflow_code : undefined,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Workflow inbox fetched successfully",
        data: result,
    });
});

const updateWorkflowRequest = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const id = getRequiredString(req.params.id, "id");
    const result = await WorkflowRequestServices.updateWorkflowRequest(
        id,
        platformId,
        req.body,
        user
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Workflow request updated successfully",
        data: result,
    });
});

export const WorkflowRequestControllers = {
    listForEntity,
    createForEntity,
    listInbox,
    updateWorkflowRequest,
};
