import { and, desc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    inboundRequests,
    orders,
    serviceRequests,
    workflowRequests,
} from "../../../db/schema";
import { eventBus } from "../../events/event-bus";
import { EVENT_TYPES } from "../../events/event-types";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { getWorkflowLifecycleState } from "../../utils/workflow-catalog";
import { AttachmentsServices } from "../attachments/attachments.services";
import { WorkflowDefinitionServices } from "../workflow-definition/workflow-definition.services";
import {
    CreateWorkflowRequestPayload,
    UpdateWorkflowRequestPayload,
} from "./workflow-request.interfaces";

export type WorkflowEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST";

const resolveEntity = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string
) => {
    if (entityType === "ORDER") {
        const [row] = await db
            .select({ id: orders.id, company_id: orders.company_id, readable_id: orders.order_id })
            .from(orders)
            .where(and(eq(orders.id, entityId), eq(orders.platform_id, platformId)))
            .limit(1);
        if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, "ORDER not found");
        return row;
    }

    if (entityType === "INBOUND_REQUEST") {
        const [row] = await db
            .select({
                id: inboundRequests.id,
                company_id: inboundRequests.company_id,
                readable_id: inboundRequests.inbound_request_id,
            })
            .from(inboundRequests)
            .where(
                and(eq(inboundRequests.id, entityId), eq(inboundRequests.platform_id, platformId))
            )
            .limit(1);
        if (!row) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "INBOUND REQUEST not found");
        }
        return row;
    }

    const [row] = await db
        .select({
            id: serviceRequests.id,
            company_id: serviceRequests.company_id,
            readable_id: serviceRequests.service_request_id,
        })
        .from(serviceRequests)
        .where(and(eq(serviceRequests.id, entityId), eq(serviceRequests.platform_id, platformId)))
        .limit(1);

    if (!row) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "SERVICE REQUEST not found");
    }

    return row;
};

const projectWorkflowRequest = (workflow: any) => ({
    ...workflow,
    lifecycle_state: getWorkflowLifecycleState(workflow.workflow_code, workflow.status),
});

const listWorkflowRequestsForEntity = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser
) => {
    await resolveEntity(entityType, entityId, platformId);
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot access internal workflows");
    }

    const rows = await db
        .select()
        .from(workflowRequests)
        .where(
            and(
                eq(workflowRequests.platform_id, platformId),
                eq(workflowRequests.entity_type, entityType),
                eq(workflowRequests.entity_id, entityId)
            )
        )
        .orderBy(desc(workflowRequests.requested_at));

    return rows.map(projectWorkflowRequest);
};

const listWorkflowInbox = async (
    platformId: string,
    user: AuthUser,
    filters?: { lifecycle_state?: string; workflow_code?: string }
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot access workflow inbox");
    }

    const rows = await db
        .select()
        .from(workflowRequests)
        .where(eq(workflowRequests.platform_id, platformId))
        .orderBy(desc(workflowRequests.requested_at));

    return rows.map(projectWorkflowRequest).filter((workflow) => {
        if (filters?.lifecycle_state && workflow.lifecycle_state !== filters.lifecycle_state) {
            return false;
        }
        if (filters?.workflow_code && workflow.workflow_code !== filters.workflow_code) {
            return false;
        }
        return true;
    });
};

const createWorkflowRequest = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser,
    payload: CreateWorkflowRequestPayload
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot create internal workflows");
    }

    const entity = await resolveEntity(entityType, entityId, platformId);
    const availableDefinitions = await WorkflowDefinitionServices.listAvailableWorkflowDefinitions(
        platformId,
        user,
        entityType,
        entityId
    );
    const definition = availableDefinitions.find((item) => item.code === payload.workflow_code);

    if (!definition) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Workflow is not enabled for this entity"
        );
    }

    WorkflowDefinitionServices.assertWorkflowStatusIsValid(definition.code, "REQUESTED");

    const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, entity.company_id))
        .limit(1);

    const created = await db.transaction(async (tx) => {
        const [workflow] = await tx
            .insert(workflowRequests)
            .values({
                platform_id: platformId,
                entity_type: entityType,
                entity_id: entityId,
                workflow_definition_id: definition.id,
                workflow_code: definition.code,
                status: "REQUESTED",
                title: payload.title,
                description: payload.description || null,
                requested_by: user.id,
                requested_by_role: user.role,
                metadata: payload.metadata || {},
            })
            .returning();

        if (payload.attachments && payload.attachments.length > 0) {
            await AttachmentsServices.createAttachmentRecords(
                "WORKFLOW_REQUEST",
                workflow.id,
                platformId,
                user,
                { attachments: payload.attachments },
                tx as any
            );
        }

        return workflow;
    });

    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.WORKFLOW_REQUEST_SUBMITTED,
        entity_type: entityType,
        entity_id: entityId,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: String((entity as any).readable_id || entity.id),
            company_id: entity.company_id,
            company_name: company?.name || "",
            workflow_request_id: created.id,
            workflow_code: created.workflow_code,
            workflow_status: created.status,
            title: created.title,
            description: created.description || "",
        },
    });

    return projectWorkflowRequest(created);
};

const updateWorkflowRequest = async (
    id: string,
    platformId: string,
    payload: UpdateWorkflowRequestPayload,
    user: AuthUser
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot update workflows");
    }

    const [existing] = await db
        .select()
        .from(workflowRequests)
        .where(and(eq(workflowRequests.id, id), eq(workflowRequests.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Workflow request not found");
    }

    const nextStatus = payload.status || existing.status;
    WorkflowDefinitionServices.assertWorkflowStatusIsValid(existing.workflow_code, nextStatus);

    const [updated] = await db
        .update(workflowRequests)
        .set({
            ...(payload.title !== undefined && { title: payload.title }),
            ...(payload.description !== undefined && { description: payload.description || null }),
            ...(payload.metadata !== undefined && { metadata: payload.metadata }),
            ...(payload.status !== undefined && { status: payload.status }),
            ...(payload.status === "ACKNOWLEDGED" && { acknowledged_at: new Date() }),
            ...(payload.status === "COMPLETED" && { completed_at: new Date() }),
            ...(payload.status === "CANCELLED" && { cancelled_at: new Date() }),
            ...(["REQUESTED", "ACKNOWLEDGED", "IN_PROGRESS"].includes(nextStatus)
                ? { completed_at: null, cancelled_at: null }
                : {}),
            updated_at: new Date(),
        })
        .where(eq(workflowRequests.id, id))
        .returning();

    return projectWorkflowRequest(updated);
};

export const WorkflowRequestServices = {
    listWorkflowRequestsForEntity,
    listWorkflowInbox,
    createWorkflowRequest,
    updateWorkflowRequest,
};
