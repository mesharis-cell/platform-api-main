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
import { AttachmentsServices } from "../attachments/attachments.services";
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
        if (!row) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "ORDER not found");
        }
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

const listWorkflowRequestsForEntity = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser
) => {
    const entity = await resolveEntity(entityType, entityId, platformId);
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot access internal workflows");
    }

    return db
        .select()
        .from(workflowRequests)
        .where(
            and(
                eq(workflowRequests.platform_id, platformId),
                eq(workflowRequests.entity_type, entityType),
                eq(workflowRequests.entity_id, entity.id)
            )
        )
        .orderBy(desc(workflowRequests.requested_at));
};

const createWorkflowRequest = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser,
    payload: CreateWorkflowRequestPayload
) => {
    const entity = await resolveEntity(entityType, entityId, platformId);
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
                workflow_kind: payload.workflow_kind,
                status: "REQUESTED",
                title: payload.title,
                description: payload.description || null,
                requested_by: user.id,
                requested_by_role: user.role,
                assigned_email: payload.assigned_email || null,
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
            workflow_kind: created.workflow_kind,
            workflow_status: created.status,
            title: created.title,
            description: created.description || "",
        },
    });

    return created;
};

const updateWorkflowRequest = async (
    id: string,
    platformId: string,
    payload: UpdateWorkflowRequestPayload
) => {
    const [existing] = await db
        .select()
        .from(workflowRequests)
        .where(and(eq(workflowRequests.id, id), eq(workflowRequests.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Workflow request not found");
    }

    const nextStatus = payload.status || existing.status;

    const [updated] = await db
        .update(workflowRequests)
        .set({
            ...(payload.title !== undefined && { title: payload.title }),
            ...(payload.description !== undefined && { description: payload.description || null }),
            ...(payload.assigned_email !== undefined && { assigned_email: payload.assigned_email }),
            ...(payload.metadata !== undefined && { metadata: payload.metadata }),
            ...(payload.status !== undefined && { status: payload.status }),
            ...(payload.status === "ACKNOWLEDGED" && { acknowledged_at: new Date() }),
            ...(payload.status === "COMPLETED" && { completed_at: new Date() }),
            ...(payload.status === "CANCELLED" && { cancelled_at: new Date() }),
            ...(["REQUESTED", "IN_PROGRESS"].includes(nextStatus)
                ? { completed_at: null, cancelled_at: null }
                : {}),
            updated_at: new Date(),
        })
        .where(eq(workflowRequests.id, id))
        .returning();

    return updated;
};

export const WorkflowRequestServices = {
    listWorkflowRequestsForEntity,
    createWorkflowRequest,
    updateWorkflowRequest,
};
