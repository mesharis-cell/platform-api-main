import { and, desc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    inboundRequests,
    orders,
    selfPickups,
    serviceRequests,
    workflowDefinitions,
    workflowRequests,
} from "../../../db/schema";
import { eventBus } from "../../events/event-bus";
import { EVENT_TYPES } from "../../events/event-types";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { getWorkflowInitialStatus, getWorkflowLifecycleState } from "../../utils/workflow-catalog";
import { AttachmentsServices } from "../attachments/attachments.services";
import { WorkflowDefinitionServices } from "../workflow-definition/workflow-definition.services";
import {
    CreateWorkflowRequestPayload,
    UpdateWorkflowRequestPayload,
} from "./workflow-request.interfaces";

export type WorkflowEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "SELF_PICKUP";

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

    if (entityType === "SELF_PICKUP") {
        const [row] = await db
            .select({
                id: selfPickups.id,
                company_id: selfPickups.company_id,
                readable_id: selfPickups.self_pickup_id,
            })
            .from(selfPickups)
            .where(and(eq(selfPickups.id, entityId), eq(selfPickups.platform_id, platformId)))
            .limit(1);
        if (!row) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "SELF PICKUP not found");
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
    lifecycle_state: getWorkflowLifecycleState(workflow.status_model_key, workflow.status),
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
        .select({
            id: workflowRequests.id,
            platform_id: workflowRequests.platform_id,
            entity_type: workflowRequests.entity_type,
            entity_id: workflowRequests.entity_id,
            workflow_definition_id: workflowRequests.workflow_definition_id,
            workflow_code: workflowRequests.workflow_code,
            workflow_label: workflowRequests.workflow_label,
            workflow_family: workflowRequests.workflow_family,
            status_model_key: workflowRequests.status_model_key,
            status: workflowRequests.status,
            title: workflowRequests.title,
            description: workflowRequests.description,
            requested_by: workflowRequests.requested_by,
            requested_by_role: workflowRequests.requested_by_role,
            requested_at: workflowRequests.requested_at,
            acknowledged_at: workflowRequests.acknowledged_at,
            completed_at: workflowRequests.completed_at,
            cancelled_at: workflowRequests.cancelled_at,
            metadata: workflowRequests.metadata,
            created_at: workflowRequests.created_at,
            updated_at: workflowRequests.updated_at,
            viewer_roles: workflowDefinitions.viewer_roles,
            actor_roles: workflowDefinitions.actor_roles,
        })
        .from(workflowRequests)
        .innerJoin(
            workflowDefinitions,
            eq(workflowDefinitions.id, workflowRequests.workflow_definition_id)
        )
        .where(
            and(
                eq(workflowRequests.platform_id, platformId),
                eq(workflowRequests.entity_type, entityType),
                eq(workflowRequests.entity_id, entityId)
            )
        )
        .orderBy(desc(workflowRequests.requested_at));

    return rows
        .filter(
            (row) => row.viewer_roles.includes(user.role) || row.actor_roles.includes(user.role)
        )
        .map(({ viewer_roles: _viewerRoles, actor_roles: _actorRoles, ...row }) =>
            projectWorkflowRequest(row)
        );
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
        .select({
            id: workflowRequests.id,
            platform_id: workflowRequests.platform_id,
            entity_type: workflowRequests.entity_type,
            entity_id: workflowRequests.entity_id,
            workflow_definition_id: workflowRequests.workflow_definition_id,
            workflow_code: workflowRequests.workflow_code,
            workflow_label: workflowRequests.workflow_label,
            workflow_family: workflowRequests.workflow_family,
            status_model_key: workflowRequests.status_model_key,
            status: workflowRequests.status,
            title: workflowRequests.title,
            description: workflowRequests.description,
            requested_by: workflowRequests.requested_by,
            requested_by_role: workflowRequests.requested_by_role,
            requested_at: workflowRequests.requested_at,
            acknowledged_at: workflowRequests.acknowledged_at,
            completed_at: workflowRequests.completed_at,
            cancelled_at: workflowRequests.cancelled_at,
            metadata: workflowRequests.metadata,
            created_at: workflowRequests.created_at,
            updated_at: workflowRequests.updated_at,
            viewer_roles: workflowDefinitions.viewer_roles,
            actor_roles: workflowDefinitions.actor_roles,
        })
        .from(workflowRequests)
        .innerJoin(
            workflowDefinitions,
            eq(workflowDefinitions.id, workflowRequests.workflow_definition_id)
        )
        .where(eq(workflowRequests.platform_id, platformId))
        .orderBy(desc(workflowRequests.requested_at));

    return rows
        .filter(
            (row) => row.viewer_roles.includes(user.role) || row.actor_roles.includes(user.role)
        )
        .map(({ viewer_roles: _viewerRoles, actor_roles: _actorRoles, ...row }) =>
            projectWorkflowRequest(row)
        )
        .filter((workflow) => {
            if (filters?.lifecycle_state && workflow.lifecycle_state !== filters.lifecycle_state) {
                return false;
            }
            if (filters?.workflow_code && workflow.workflow_code !== filters.workflow_code) {
                return false;
            }
            return true;
        });
};

const emitWorkflowEvent = async (
    eventType: string,
    workflow: {
        id: string;
        workflow_code: string;
        workflow_label: string;
        workflow_family: string;
        status_model_key: string;
        status: string;
        title: string;
        description: string | null;
        entity_type: WorkflowEntityType;
        entity_id: string;
    },
    entity: { id: string; company_id: string; readable_id: string },
    companyName: string,
    actor: AuthUser,
    previousStatus?: string
) => {
    await eventBus.emit({
        platform_id: actor.platform_id,
        event_type: eventType,
        entity_type: workflow.entity_type,
        entity_id: workflow.entity_id,
        actor_id: actor.id,
        actor_role: actor.role,
        payload: {
            entity_id_readable: String(entity.readable_id || entity.id),
            company_id: entity.company_id,
            company_name: companyName,
            workflow_request_id: workflow.id,
            workflow_code: workflow.workflow_code,
            workflow_label: workflow.workflow_label,
            workflow_family: workflow.workflow_family,
            workflow_status: workflow.status,
            lifecycle_state: getWorkflowLifecycleState(workflow.status_model_key, workflow.status),
            old_status: previousStatus || "",
            new_status: workflow.status,
            title: workflow.title,
            description: workflow.description || "",
        },
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

    const initialStatus = getWorkflowInitialStatus(definition.status_model_key);
    WorkflowDefinitionServices.assertWorkflowStatusIsValid(
        definition.status_model_key,
        initialStatus
    );

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
                workflow_label: definition.label,
                workflow_family: definition.workflow_family,
                status_model_key: definition.status_model_key,
                status: initialStatus,
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

    await emitWorkflowEvent(
        EVENT_TYPES.WORKFLOW_REQUEST_SUBMITTED,
        created,
        entity,
        company?.name || "",
        user
    );

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
        .select({
            id: workflowRequests.id,
            platform_id: workflowRequests.platform_id,
            entity_type: workflowRequests.entity_type,
            entity_id: workflowRequests.entity_id,
            workflow_definition_id: workflowRequests.workflow_definition_id,
            workflow_code: workflowRequests.workflow_code,
            workflow_label: workflowRequests.workflow_label,
            workflow_family: workflowRequests.workflow_family,
            status_model_key: workflowRequests.status_model_key,
            status: workflowRequests.status,
            title: workflowRequests.title,
            description: workflowRequests.description,
            metadata: workflowRequests.metadata,
            actor_roles: workflowDefinitions.actor_roles,
        })
        .from(workflowRequests)
        .innerJoin(
            workflowDefinitions,
            eq(workflowDefinitions.id, workflowRequests.workflow_definition_id)
        )
        .where(and(eq(workflowRequests.id, id), eq(workflowRequests.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Workflow request not found");
    }

    if (!existing.actor_roles.includes(user.role)) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "You do not have permission to update this workflow"
        );
    }

    const nextStatus = payload.status || existing.status;
    WorkflowDefinitionServices.assertWorkflowStatusIsValid(existing.status_model_key, nextStatus);

    const [updated] = await db
        .update(workflowRequests)
        .set({
            ...(payload.title !== undefined && { title: payload.title }),
            ...(payload.description !== undefined && { description: payload.description || null }),
            ...(payload.metadata !== undefined && { metadata: payload.metadata }),
            ...(payload.status !== undefined && { status: payload.status }),
            ...(payload.status === "ACKNOWLEDGED" && { acknowledged_at: new Date() }),
            ...(payload.status === "COMPLETED" && { completed_at: new Date(), cancelled_at: null }),
            ...(payload.status === "CANCELLED" && { cancelled_at: new Date(), completed_at: null }),
            ...([
                "REQUESTED",
                "ACKNOWLEDGED",
                "IN_PROGRESS",
                "COLLECTING",
                "UNDER_REVIEW",
                "IN_REVIEW",
            ].includes(nextStatus)
                ? { completed_at: null, cancelled_at: null }
                : {}),
            updated_at: new Date(),
        })
        .where(eq(workflowRequests.id, id))
        .returning();

    const entity = await resolveEntity(existing.entity_type, existing.entity_id, platformId);
    const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, entity.company_id))
        .limit(1);

    if (existing.status !== updated.status) {
        await emitWorkflowEvent(
            EVENT_TYPES.WORKFLOW_REQUEST_STATUS_CHANGED,
            updated,
            entity,
            company?.name || "",
            user,
            existing.status
        );

        if (updated.status === "COMPLETED" || updated.status === "APPROVED") {
            await emitWorkflowEvent(
                EVENT_TYPES.WORKFLOW_REQUEST_COMPLETED,
                updated,
                entity,
                company?.name || "",
                user,
                existing.status
            );
        }

        if (updated.status === "CANCELLED") {
            await emitWorkflowEvent(
                EVENT_TYPES.WORKFLOW_REQUEST_CANCELLED,
                updated,
                entity,
                company?.name || "",
                user,
                existing.status
            );
        }
    }

    return projectWorkflowRequest(updated);
};

export const WorkflowRequestServices = {
    listWorkflowRequestsForEntity,
    listWorkflowInbox,
    createWorkflowRequest,
    updateWorkflowRequest,
};
