import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    entityAttachments,
    inboundRequests,
    orders,
    selfPickups,
    serviceRequests,
    users,
    workflowDefinitions,
    workflowRequests,
    workflowRequestStatusHistory,
} from "../../../db/schema";
import { eventBus } from "../../events/event-bus";
import { EVENT_TYPES } from "../../events/event-types";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { getWorkflowInitialStatus, getWorkflowLifecycleState } from "../../utils/workflow-catalog";
import {
    getWorkflowIntakeValues,
    isBlankWorkflowValue,
    isWorkflowClientActionRequired,
    isWorkflowClientEditableStatus,
    isWorkflowClientVisible,
    isWorkflowSubmitForReviewStatus,
    normalizeWorkflowIntakeSchema,
} from "../../utils/workflow-intake";
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
            .select({
                id: orders.id,
                company_id: orders.company_id,
                readable_id: orders.order_id,
                created_by: orders.created_by,
            })
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
                created_by: selfPickups.created_by,
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

const assertWorkflowReadyForReview = async (workflow: {
    id: string;
    metadata: unknown;
    intake_schema: unknown;
}) => {
    const intakeSchema = normalizeWorkflowIntakeSchema(workflow.intake_schema);
    const values = getWorkflowIntakeValues(workflow.metadata);
    const missingFields = (intakeSchema.fields || [])
        .filter((field) => field.required && isBlankWorkflowValue(values[field.key]))
        .map((field) => field.label);

    if (missingFields.length > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Complete required workflow fields before submitting for review: ${missingFields.join(", ")}`
        );
    }

    const requiredAttachmentTypeIds = intakeSchema.required_attachment_type_ids || [];
    if (requiredAttachmentTypeIds.length === 0) return;

    const attachmentRows = await db
        .select({
            attachment_type_id: entityAttachments.attachment_type_id,
        })
        .from(entityAttachments)
        .where(
            and(
                eq(entityAttachments.entity_type, "WORKFLOW_REQUEST"),
                eq(entityAttachments.entity_id, workflow.id),
                inArray(entityAttachments.attachment_type_id, requiredAttachmentTypeIds)
            )
        );
    const present = new Set(attachmentRows.map((row) => row.attachment_type_id));
    const missingDocs = requiredAttachmentTypeIds.filter((id) => !present.has(id));
    if (missingDocs.length > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Upload all required workflow documents before submitting for review"
        );
    }
};

type WorkflowStatusHistoryEntry = {
    id: string;
    workflow_request_id: string;
    from_status: string | null;
    to_status: string;
    changed_by: string | null;
    changed_at: Date;
    note: string | null;
    changed_by_user: {
        id: string;
        name: string | null;
        email: string | null;
    } | null;
};

const attachStatusHistory = async <T extends { id: string }>(workflows: T[]) => {
    if (workflows.length === 0) return workflows;

    const workflowIds = workflows.map((workflow) => workflow.id);
    const historyRows = await db
        .select({
            id: workflowRequestStatusHistory.id,
            workflow_request_id: workflowRequestStatusHistory.workflow_request_id,
            from_status: workflowRequestStatusHistory.from_status,
            to_status: workflowRequestStatusHistory.to_status,
            changed_by: workflowRequestStatusHistory.changed_by,
            changed_at: workflowRequestStatusHistory.changed_at,
            note: workflowRequestStatusHistory.note,
            changed_by_user: {
                id: users.id,
                name: users.name,
                email: users.email,
            },
        })
        .from(workflowRequestStatusHistory)
        .leftJoin(users, eq(workflowRequestStatusHistory.changed_by, users.id))
        .where(inArray(workflowRequestStatusHistory.workflow_request_id, workflowIds))
        .orderBy(
            asc(workflowRequestStatusHistory.workflow_request_id),
            asc(workflowRequestStatusHistory.changed_at)
        );

    const historyByWorkflowId = new Map<string, WorkflowStatusHistoryEntry[]>();
    for (const row of historyRows) {
        const rows = historyByWorkflowId.get(row.workflow_request_id) || [];
        const changedByUser = row.changed_by_user?.id
            ? {
                  id: row.changed_by_user.id,
                  name: row.changed_by_user.name,
                  email: row.changed_by_user.email,
              }
            : null;
        rows.push({
            ...row,
            changed_by_user: changedByUser,
        });
        historyByWorkflowId.set(row.workflow_request_id, rows);
    }

    return workflows.map((workflow) => ({
        ...workflow,
        status_history: historyByWorkflowId.get(workflow.id) || [],
    }));
};

const listWorkflowRequestsForEntity = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser
) => {
    const entity = await resolveEntity(entityType, entityId, platformId);
    // Item 4: clients can now LIST workflows on their own entities. The
    // post-fetch filter still gates them to definitions whose viewer_roles
    // or actor_roles include CLIENT — internal-only workflows stay hidden.
    // Additionally, scope to the caller's company so a client can't list
    // workflows on an entity they don't own.
    if (user.role === "CLIENT") {
        if (!user.company_id || entity.company_id !== user.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You do not have access to this entity"
            );
        }
        if (
            (entityType === "ORDER" || entityType === "SELF_PICKUP") &&
            "created_by" in entity &&
            entity.created_by &&
            entity.created_by !== user.id
        ) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You do not have access to this entity"
            );
        }
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
            intake_schema: workflowDefinitions.intake_schema,
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

    const workflows = rows
        .filter(
            (row) => row.viewer_roles.includes(user.role) || row.actor_roles.includes(user.role)
        )
        .map(({ viewer_roles: _viewerRoles, actor_roles: _actorRoles, ...row }) =>
            projectWorkflowRequest(row)
        );

    return attachStatusHistory(workflows);
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
            intake_schema: workflowDefinitions.intake_schema,
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

    const workflows = rows
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

    return attachStatusHistory(workflows);
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
        intake_schema?: unknown;
        viewer_roles?: string[];
        actor_roles?: string[];
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
            client_action_required: isWorkflowClientActionRequired(
                workflow.status_model_key,
                workflow.status,
                workflow.actor_roles || []
            ),
            client_visible: isWorkflowClientVisible(
                workflow.viewer_roles || [],
                workflow.actor_roles || []
            ),
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

        await tx.insert(workflowRequestStatusHistory).values({
            workflow_request_id: workflow.id,
            from_status: null,
            to_status: initialStatus,
            changed_by: user.id,
            note: "Workflow requested",
        });

        return workflow;
    });

    await emitWorkflowEvent(
        EVENT_TYPES.WORKFLOW_REQUEST_SUBMITTED,
        {
            ...created,
            intake_schema: definition.intake_schema,
            viewer_roles: definition.viewer_roles,
            actor_roles: definition.actor_roles,
        },
        entity,
        company?.name || "",
        user
    );

    const [withHistory] = await attachStatusHistory([
        projectWorkflowRequest({
            ...created,
            intake_schema: definition.intake_schema,
        }),
    ]);
    return withHistory;
};

const updateWorkflowRequest = async (
    id: string,
    platformId: string,
    payload: UpdateWorkflowRequestPayload,
    user: AuthUser
) => {
    // Item 4: client authorization is now definition-aware. The original
    // blanket CLIENT block is removed because workflow_definitions.actor_roles
    // already gates who can act. Clients in actor_roles can update their
    // own workflows (e.g. submit a permit). The role check happens below
    // against the definition's actor_roles array.

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
            intake_schema: workflowDefinitions.intake_schema,
            viewer_roles: workflowDefinitions.viewer_roles,
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

    const entity = await resolveEntity(existing.entity_type, existing.entity_id, platformId);
    if (user.role === "CLIENT") {
        if (!user.company_id || entity.company_id !== user.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You do not have access to this workflow"
            );
        }
        if (
            (existing.entity_type === "ORDER" || existing.entity_type === "SELF_PICKUP") &&
            "created_by" in entity &&
            entity.created_by &&
            entity.created_by !== user.id
        ) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You do not have access to this workflow"
            );
        }
        if (!isWorkflowClientEditableStatus(existing.status_model_key, existing.status)) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "This workflow is under review and can no longer be edited by the client"
            );
        }
    }

    const nextMetadata = payload.metadata !== undefined ? payload.metadata : existing.metadata;
    if (payload.status && isWorkflowSubmitForReviewStatus(existing.status_model_key, nextStatus)) {
        await assertWorkflowReadyForReview({
            id: existing.id,
            metadata: nextMetadata,
            intake_schema: existing.intake_schema,
        });
    }

    const [updated] = await db
        .update(workflowRequests)
        .set({
            ...(payload.title !== undefined && { title: payload.title }),
            ...(payload.description !== undefined && { description: payload.description || null }),
            ...(payload.metadata !== undefined && { metadata: nextMetadata }),
            ...(payload.status !== undefined && { status: payload.status }),
            ...(payload.status === "ACKNOWLEDGED" && { acknowledged_at: new Date() }),
            ...(payload.status !== undefined &&
                ["COMPLETED", "APPROVED", "REJECTED"].includes(nextStatus) && {
                    completed_at: new Date(),
                    cancelled_at: null,
                }),
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

    const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, entity.company_id))
        .limit(1);

    const transitionNote = payload.transition_note?.trim() || null;
    const statusChanged = existing.status !== updated.status;

    if (statusChanged || transitionNote) {
        // Item 4: keep workflow operational notes in the audit trail. Notes
        // without a status change are stored with from_status === to_status.
        await db.insert(workflowRequestStatusHistory).values({
            workflow_request_id: updated.id,
            from_status: existing.status,
            to_status: updated.status,
            changed_by: user.id,
            note: transitionNote,
        });
    }

    if (statusChanged) {
        await emitWorkflowEvent(
            EVENT_TYPES.WORKFLOW_REQUEST_STATUS_CHANGED,
            {
                ...updated,
                intake_schema: existing.intake_schema,
                viewer_roles: existing.viewer_roles,
                actor_roles: existing.actor_roles,
            },
            entity,
            company?.name || "",
            user,
            existing.status
        );

        if (updated.status === "COMPLETED" || updated.status === "APPROVED") {
            await emitWorkflowEvent(
                EVENT_TYPES.WORKFLOW_REQUEST_COMPLETED,
                {
                    ...updated,
                    intake_schema: existing.intake_schema,
                    viewer_roles: existing.viewer_roles,
                    actor_roles: existing.actor_roles,
                },
                entity,
                company?.name || "",
                user,
                existing.status
            );
        }

        if (updated.status === "CANCELLED") {
            await emitWorkflowEvent(
                EVENT_TYPES.WORKFLOW_REQUEST_CANCELLED,
                {
                    ...updated,
                    intake_schema: existing.intake_schema,
                    viewer_roles: existing.viewer_roles,
                    actor_roles: existing.actor_roles,
                },
                entity,
                company?.name || "",
                user,
                existing.status
            );
        }
    }

    const [withHistory] = await attachStatusHistory([
        projectWorkflowRequest({
            ...updated,
            intake_schema: existing.intake_schema,
        }),
    ]);
    return withHistory;
};

const cancelOpenWorkflowRequestsForEntity = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string,
    actorId: string,
    note: string,
    tx: typeof db = db
) => {
    const openRows = await tx
        .select({
            id: workflowRequests.id,
            status: workflowRequests.status,
        })
        .from(workflowRequests)
        .where(
            and(
                eq(workflowRequests.platform_id, platformId),
                eq(workflowRequests.entity_type, entityType),
                eq(workflowRequests.entity_id, entityId),
                notInArray(workflowRequests.status, [
                    "COMPLETED",
                    "APPROVED",
                    "REJECTED",
                    "CANCELLED",
                ])
            )
        );

    if (openRows.length === 0) return { cancelled: 0 };

    await tx
        .update(workflowRequests)
        .set({
            status: "CANCELLED",
            cancelled_at: new Date(),
            completed_at: null,
            updated_at: new Date(),
        })
        .where(
            and(
                eq(workflowRequests.platform_id, platformId),
                eq(workflowRequests.entity_type, entityType),
                eq(workflowRequests.entity_id, entityId),
                inArray(
                    workflowRequests.id,
                    openRows.map((row) => row.id)
                )
            )
        );

    await tx.insert(workflowRequestStatusHistory).values(
        openRows.map((row) => ({
            workflow_request_id: row.id,
            from_status: row.status,
            to_status: "CANCELLED",
            changed_by: actorId,
            note,
        }))
    );

    return { cancelled: openRows.length };
};

export const WorkflowRequestServices = {
    listWorkflowRequestsForEntity,
    listWorkflowInbox,
    createWorkflowRequest,
    updateWorkflowRequest,
    cancelOpenWorkflowRequestsForEntity,
};
