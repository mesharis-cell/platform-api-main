import { and, desc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    attachmentTypes,
    entityAttachments,
    inboundRequests,
    orders,
    selfPickups,
    serviceRequests,
    users,
    workflowDefinitions,
    workflowRequests,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eventBus, EVENT_TYPES } from "../../events";
import { isWorkflowClientEditableStatus } from "../../utils/workflow-intake";
import {
    CreateEntityAttachmentsPayload,
    CreateWorkflowAttachmentsPayload,
} from "./attachments.interfaces";

export type AttachmentEntityType =
    | "ORDER"
    | "INBOUND_REQUEST"
    | "SERVICE_REQUEST"
    | "SELF_PICKUP"
    | "WORKFLOW_REQUEST";

const resolveEntity = async (
    executor: typeof db,
    entityType: AttachmentEntityType,
    entityId: string,
    platformId: string
): Promise<{
    entity_type: AttachmentEntityType;
    entity_id: string;
    company_id: string | null;
    created_by?: string | null;
    workflow_status?: string | null;
    workflow_status_model_key?: string | null;
    workflow_actor_roles?: string[] | null;
}> => {
    if (entityType === "ORDER") {
        const [row] = await executor
            .select({ id: orders.id, company_id: orders.company_id, created_by: orders.created_by })
            .from(orders)
            .where(and(eq(orders.id, entityId), eq(orders.platform_id, platformId)))
            .limit(1);
        if (!row) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "ORDER not found");
        }
        return {
            entity_type: entityType,
            entity_id: row.id,
            company_id: row.company_id,
            created_by: row.created_by,
        };
    }

    if (entityType === "INBOUND_REQUEST") {
        const [row] = await executor
            .select({ id: inboundRequests.id, company_id: inboundRequests.company_id })
            .from(inboundRequests)
            .where(
                and(eq(inboundRequests.id, entityId), eq(inboundRequests.platform_id, platformId))
            )
            .limit(1);
        if (!row) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "INBOUND REQUEST not found");
        }
        return { entity_type: entityType, entity_id: row.id, company_id: row.company_id };
    }

    if (entityType === "SERVICE_REQUEST") {
        const [row] = await executor
            .select({ id: serviceRequests.id, company_id: serviceRequests.company_id })
            .from(serviceRequests)
            .where(
                and(eq(serviceRequests.id, entityId), eq(serviceRequests.platform_id, platformId))
            )
            .limit(1);
        if (!row) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "SERVICE REQUEST not found");
        }
        return { entity_type: entityType, entity_id: row.id, company_id: row.company_id };
    }

    if (entityType === "SELF_PICKUP") {
        const [row] = await executor
            .select({
                id: selfPickups.id,
                company_id: selfPickups.company_id,
                created_by: selfPickups.created_by,
            })
            .from(selfPickups)
            .where(and(eq(selfPickups.id, entityId), eq(selfPickups.platform_id, platformId)))
            .limit(1);
        if (!row) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "SELF PICKUP not found");
        }
        return {
            entity_type: entityType,
            entity_id: row.id,
            company_id: row.company_id,
            created_by: row.created_by,
        };
    }

    const [row] = await executor
        .select({
            id: workflowRequests.id,
            entity_type: workflowRequests.entity_type,
            entity_id: workflowRequests.entity_id,
            status: workflowRequests.status,
            status_model_key: workflowRequests.status_model_key,
            actor_roles: workflowDefinitions.actor_roles,
        })
        .from(workflowRequests)
        .innerJoin(
            workflowDefinitions,
            eq(workflowDefinitions.id, workflowRequests.workflow_definition_id)
        )
        .where(and(eq(workflowRequests.id, entityId), eq(workflowRequests.platform_id, platformId)))
        .limit(1);

    if (!row) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "WORKFLOW REQUEST not found");
    }

    const parent = await resolveEntity(
        executor,
        row.entity_type as Exclude<AttachmentEntityType, "WORKFLOW_REQUEST">,
        row.entity_id,
        platformId
    );

    return {
        entity_type: entityType,
        entity_id: row.id,
        company_id: parent.company_id,
        created_by: parent.created_by,
        workflow_status: row.status,
        workflow_status_model_key: row.status_model_key,
        workflow_actor_roles: row.actor_roles,
    };
};

const assertEntityAccess = (
    entity: {
        entity_type: AttachmentEntityType;
        company_id: string | null;
        created_by?: string | null;
    },
    user: AuthUser
) => {
    if (user.role !== "CLIENT") return;
    if (!user.company_id || entity.company_id !== user.company_id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this entity");
    }
    if (
        (entity.entity_type === "ORDER" ||
            entity.entity_type === "SELF_PICKUP" ||
            entity.entity_type === "WORKFLOW_REQUEST") &&
        entity.created_by &&
        entity.created_by !== user.id
    ) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this entity");
    }
};

const assertWorkflowAttachmentMutationAllowed = (
    entity: Awaited<ReturnType<typeof resolveEntity>>,
    user: AuthUser
) => {
    if (entity.entity_type !== "WORKFLOW_REQUEST" || user.role !== "CLIENT") return;
    if (!entity.workflow_actor_roles?.includes("CLIENT")) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "You do not have permission to upload files for this workflow"
        );
    }
    if (
        !entity.workflow_status_model_key ||
        !entity.workflow_status ||
        !isWorkflowClientEditableStatus(entity.workflow_status_model_key, entity.workflow_status)
    ) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "This workflow is under review and can no longer be edited by the client"
        );
    }
};

const normalizeVisibility = (
    requested: boolean | undefined,
    defaultVisible: boolean,
    typeViewRoles: string[],
    user: AuthUser
) => {
    const clientCanEverView = typeViewRoles.includes("CLIENT");
    if (user.role === "CLIENT") return clientCanEverView;
    if (!clientCanEverView) return false;
    if (requested !== undefined) return requested;
    return defaultVisible;
};

const listEntityAttachments = async (
    entityType: AttachmentEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser
) => {
    const entity = await resolveEntity(db, entityType, entityId, platformId);
    assertEntityAccess(entity, user);
    const conditions = [
        eq(entityAttachments.platform_id, platformId),
        eq(entityAttachments.entity_type, entityType),
        eq(entityAttachments.entity_id, entityId),
    ];
    if (user.role === "CLIENT") {
        conditions.push(eq(entityAttachments.visible_to_client, true));
    }

    const rows = await db
        .select({
            id: entityAttachments.id,
            entity_type: entityAttachments.entity_type,
            entity_id: entityAttachments.entity_id,
            file_url: entityAttachments.file_url,
            file_name: entityAttachments.file_name,
            mime_type: entityAttachments.mime_type,
            file_size_bytes: entityAttachments.file_size_bytes,
            note: entityAttachments.note,
            visible_to_client: entityAttachments.visible_to_client,
            created_at: entityAttachments.created_at,
            attachment_type: {
                id: attachmentTypes.id,
                code: attachmentTypes.code,
                label: attachmentTypes.label,
                view_roles: attachmentTypes.view_roles,
            },
            uploaded_by_user: {
                id: users.id,
                name: users.name,
                email: users.email,
            },
        })
        .from(entityAttachments)
        .innerJoin(attachmentTypes, eq(entityAttachments.attachment_type_id, attachmentTypes.id))
        .leftJoin(users, eq(entityAttachments.uploaded_by, users.id))
        .where(and(...conditions))
        .orderBy(desc(entityAttachments.created_at));

    return rows.filter((row) => row.attachment_type.view_roles.includes(user.role));
};

const createAttachmentRecords = async (
    entityType: AttachmentEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser,
    payload: CreateEntityAttachmentsPayload | CreateWorkflowAttachmentsPayload,
    tx: typeof db = db
) => {
    const entity = await resolveEntity(tx, entityType, entityId, platformId);
    assertEntityAccess(entity, user);
    assertWorkflowAttachmentMutationAllowed(entity, user);

    const types = await tx
        .select()
        .from(attachmentTypes)
        .where(
            and(eq(attachmentTypes.platform_id, platformId), eq(attachmentTypes.is_active, true))
        );

    const typeMap = new Map(types.map((item) => [item.id, item]));

    const values = payload.attachments.map((attachment) => {
        const type = typeMap.get(attachment.attachment_type_id);
        if (!type) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Attachment type not found or inactive"
            );
        }
        if (!type.allowed_entity_types.includes(entityType as any)) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `${type.label} is not allowed for ${entityType.replace(/_/g, " ")}`
            );
        }
        if (!type.upload_roles.includes(user.role)) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                `${type.label} cannot be uploaded by ${user.role}`
            );
        }
        if (type.required_note && !attachment.note?.trim()) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, `${type.label} requires a note`);
        }

        return {
            platform_id: platformId,
            entity_type: entityType,
            entity_id: entityId,
            attachment_type_id: attachment.attachment_type_id,
            file_url: attachment.file_url,
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            file_size_bytes: attachment.file_size_bytes ?? null,
            note: attachment.note || null,
            visible_to_client: normalizeVisibility(
                attachment.visible_to_client,
                type.default_visible_to_client,
                type.view_roles,
                user
            ),
            uploaded_by: user.id,
        };
    });

    if (payload.attachments.length === 0) return [];

    const inserted = await tx.insert(entityAttachments).values(values).returning();

    // Item 3: emit ATTACHMENT_ADDED per inserted row so audit/notification
    // rules can react. Audit-only by default — tenants can wire emails.
    for (const row of inserted) {
        const type = typeMap.get(row.attachment_type_id);
        eventBus.emit({
            event_type: EVENT_TYPES.ATTACHMENT_ADDED,
            platform_id: platformId,
            entity_type: entityType as any,
            entity_id: entityId,
            actor_id: user.id,
            payload: {
                attachment_id: row.id,
                attachment_type_id: row.attachment_type_id,
                attachment_type_code: type?.code ?? null,
                file_name: row.file_name,
                visible_to_client: row.visible_to_client,
                uploaded_by: row.uploaded_by,
            },
        });
    }

    return inserted;
};

const createEntityAttachments = async (
    entityType: AttachmentEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser,
    payload: CreateEntityAttachmentsPayload
) => createAttachmentRecords(entityType, entityId, platformId, user, payload);

const deleteAttachment = async (id: string, platformId: string, actorId?: string) => {
    const [existing] = await db
        .select({
            id: entityAttachments.id,
            entity_type: entityAttachments.entity_type,
            entity_id: entityAttachments.entity_id,
            file_name: entityAttachments.file_name,
        })
        .from(entityAttachments)
        .where(and(eq(entityAttachments.id, id), eq(entityAttachments.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Attachment not found");
    }

    await db.delete(entityAttachments).where(eq(entityAttachments.id, id));

    // Item 3: emit ATTACHMENT_DELETED for audit.
    eventBus.emit({
        event_type: EVENT_TYPES.ATTACHMENT_DELETED,
        platform_id: platformId,
        entity_type: existing.entity_type as any,
        entity_id: existing.entity_id,
        actor_id: actorId,
        payload: {
            attachment_id: existing.id,
            file_name: existing.file_name,
        },
    });

    return { id };
};

export const AttachmentsServices = {
    listEntityAttachments,
    createEntityAttachments,
    createAttachmentRecords,
    deleteAttachment,
};
