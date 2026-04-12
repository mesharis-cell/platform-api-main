import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";
import {
    listWorkflowFamilyOptions,
    listWorkflowStatusModelOptions,
} from "../../utils/workflow-catalog";
import { WorkflowDefinitionServices } from "./workflow-definition.services";

const getWorkflowDefinitionMeta = catchAsync(async (_req, res) => {
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Workflow definition meta fetched successfully",
        data: {
            workflow_families: listWorkflowFamilyOptions(),
            status_models: listWorkflowStatusModelOptions(),
        },
    });
});

const listWorkflowDefinitions = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await WorkflowDefinitionServices.listWorkflowDefinitions(platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Workflow definitions fetched successfully",
        data: result,
    });
});

const listAvailableWorkflowDefinitions = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const user = (req as any).user;
    const entityType = req.query.entity_type as
        | "ORDER"
        | "INBOUND_REQUEST"
        | "SERVICE_REQUEST"
        | "SELF_PICKUP";
    const entityId = req.query.entity_id as string;
    const result = await WorkflowDefinitionServices.listAvailableWorkflowDefinitions(
        platformId,
        user,
        entityType,
        entityId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Available workflow definitions fetched successfully",
        data: result,
    });
});

const createWorkflowDefinition = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await WorkflowDefinitionServices.createWorkflowDefinition(platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Workflow definition created successfully",
        data: result,
    });
});

const updateWorkflowDefinition = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await WorkflowDefinitionServices.updateWorkflowDefinition(
        id,
        platformId,
        req.body
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Workflow definition updated successfully",
        data: result,
    });
});

const replaceCompanyOverrides = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await WorkflowDefinitionServices.replaceCompanyOverrides(
        id,
        platformId,
        req.body.overrides
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Workflow company overrides updated successfully",
        data: result,
    });
});

const deleteWorkflowDefinition = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const result = await WorkflowDefinitionServices.deleteWorkflowDefinition(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Workflow definition deleted successfully",
        data: result,
    });
});

export const WorkflowDefinitionControllers = {
    getWorkflowDefinitionMeta,
    listWorkflowDefinitions,
    createWorkflowDefinition,
    listAvailableWorkflowDefinitions,
    updateWorkflowDefinition,
    replaceCompanyOverrides,
    deleteWorkflowDefinition,
};
