import { and, asc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { attachmentTypes } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    CreateAttachmentTypePayload,
    UpdateAttachmentTypePayload,
} from "./attachment-types.interfaces";

const listAttachmentTypes = async (
    platformId: string,
    user: AuthUser,
    filters?: { entity_type?: string }
) => {
    const rows = await db
        .select()
        .from(attachmentTypes)
        .where(eq(attachmentTypes.platform_id, platformId))
        .orderBy(asc(attachmentTypes.sort_order), asc(attachmentTypes.label));

    if (user.role === "ADMIN" && !filters?.entity_type) {
        return rows;
    }

    return rows.filter((row) => {
        const entityMatch = filters?.entity_type
            ? row.allowed_entity_types.includes(filters.entity_type as any)
            : true;
        const viewMatch = row.view_roles.includes(user.role);
        return entityMatch && viewMatch && row.is_active;
    });
};

const createAttachmentType = async (platformId: string, payload: CreateAttachmentTypePayload) => {
    const uploadRoles = [...new Set(payload.upload_roles)];
    const viewRoles = [...new Set(payload.view_roles ?? payload.upload_roles)];
    const [created] = await db
        .insert(attachmentTypes)
        .values({
            platform_id: platformId,
            code: payload.code.trim().toUpperCase(),
            label: payload.label.trim(),
            allowed_entity_types: payload.allowed_entity_types as any,
            upload_roles: uploadRoles as any,
            view_roles: viewRoles as any,
            default_visible_to_client: payload.default_visible_to_client ?? false,
            is_active: payload.is_active ?? true,
            sort_order: payload.sort_order ?? 0,
        })
        .returning();

    return created;
};

const updateAttachmentType = async (
    id: string,
    platformId: string,
    payload: UpdateAttachmentTypePayload
) => {
    const [existing] = await db
        .select({ id: attachmentTypes.id })
        .from(attachmentTypes)
        .where(and(eq(attachmentTypes.id, id), eq(attachmentTypes.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Attachment type not found");
    }

    const [updated] = await db
        .update(attachmentTypes)
        .set({
            ...(payload.code !== undefined && { code: payload.code.trim().toUpperCase() }),
            ...(payload.label !== undefined && { label: payload.label.trim() }),
            ...(payload.allowed_entity_types !== undefined && {
                allowed_entity_types: payload.allowed_entity_types as any,
            }),
            ...(payload.upload_roles !== undefined && {
                upload_roles: [...new Set(payload.upload_roles)] as any,
            }),
            ...((payload.view_roles !== undefined || payload.upload_roles !== undefined) && {
                view_roles: [...new Set(payload.view_roles ?? payload.upload_roles ?? [])] as any,
            }),
            ...(payload.default_visible_to_client !== undefined && {
                default_visible_to_client: payload.default_visible_to_client,
            }),
            ...(payload.is_active !== undefined && { is_active: payload.is_active }),
            ...(payload.sort_order !== undefined && { sort_order: payload.sort_order }),
            updated_at: new Date(),
        })
        .where(eq(attachmentTypes.id, id))
        .returning();

    return updated;
};

export const AttachmentTypesServices = {
    listAttachmentTypes,
    createAttachmentType,
    updateAttachmentType,
};
