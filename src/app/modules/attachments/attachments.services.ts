import { and, desc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    attachmentTypes,
    entityAttachments,
    inboundRequests,
    orders,
    serviceRequests,
    users,
    workflowRequests,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    CreateEntityAttachmentsPayload,
    CreateWorkflowAttachmentsPayload,
} from "./attachments.interfaces";

export type AttachmentEntityType =
    | "ORDER"
    | "INBOUND_REQUEST"
    | "SERVICE_REQUEST"
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

    const [row] = await executor
        .select({ id: workflowRequests.id })
        .from(workflowRequests)
        .where(and(eq(workflowRequests.id, entityId), eq(workflowRequests.platform_id, platformId)))
        .limit(1);

    if (!row) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "WORKFLOW REQUEST not found");
    }

    return {
        entity_type: entityType,
        entity_id: row.id,
        company_id: null,
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
    if (entity.entity_type === "ORDER" && entity.created_by !== user.id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this entity");
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

    return tx.insert(entityAttachments).values(values).returning();
};

const createEntityAttachments = async (
    entityType: AttachmentEntityType,
    entityId: string,
    platformId: string,
    user: AuthUser,
    payload: CreateEntityAttachmentsPayload
) => createAttachmentRecords(entityType, entityId, platformId, user, payload);

const deleteAttachment = async (id: string, platformId: string) => {
    const [existing] = await db
        .select({ id: entityAttachments.id })
        .from(entityAttachments)
        .where(and(eq(entityAttachments.id, id), eq(entityAttachments.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Attachment not found");
    }

    await db.delete(entityAttachments).where(eq(entityAttachments.id, id));
    return { id };
};

export const AttachmentsServices = {
    listEntityAttachments,
    createEntityAttachments,
    createAttachmentRecords,
    deleteAttachment,
};
