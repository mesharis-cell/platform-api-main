import { and, asc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    attachmentTypes,
    companies,
    inboundRequests,
    orders,
    platforms,
    serviceRequests,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    CreateAttachmentTypePayload,
    UpdateAttachmentTypePayload,
} from "./attachment-types.interfaces";

type AttachmentTypeListFilters = {
    entity_type?: string;
    mode?: "view" | "upload";
    entity_id?: string;
    context_entity_type?: "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST";
    context_entity_id?: string;
};

const sanitizePlatformAttachmentFeature = (features: unknown) => {
    const raw = (features || {}) as Record<string, unknown>;
    return raw.enable_attachments === undefined ? true : Boolean(raw.enable_attachments);
};

const sanitizeCompanyAttachmentOverride = (features: unknown) => {
    const raw = (features || {}) as Record<string, unknown>;
    return raw.enable_attachments === undefined ? undefined : Boolean(raw.enable_attachments);
};

const resolveAttachmentFeatureState = async (
    platformId: string,
    filters?: AttachmentTypeListFilters
) => {
    if (!filters?.entity_type && !filters?.context_entity_type) {
        return true;
    }

    const [platform] = await db
        .select({ features: platforms.features })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    let enabled = sanitizePlatformAttachmentFeature(platform?.features);

    const contextEntityType = filters?.context_entity_type;
    const contextEntityId = filters?.context_entity_id;
    const entityType = filters?.entity_type as
        | "ORDER"
        | "INBOUND_REQUEST"
        | "SERVICE_REQUEST"
        | undefined;
    const entityId = filters?.entity_id;

    let companyId: string | null = null;

    if (contextEntityType && contextEntityId) {
        if (contextEntityType === "ORDER") {
            const [row] = await db
                .select({ company_id: orders.company_id })
                .from(orders)
                .where(and(eq(orders.id, contextEntityId), eq(orders.platform_id, platformId)))
                .limit(1);
            companyId = row?.company_id ?? null;
        } else if (contextEntityType === "INBOUND_REQUEST") {
            const [row] = await db
                .select({ company_id: inboundRequests.company_id })
                .from(inboundRequests)
                .where(
                    and(
                        eq(inboundRequests.id, contextEntityId),
                        eq(inboundRequests.platform_id, platformId)
                    )
                )
                .limit(1);
            companyId = row?.company_id ?? null;
        } else if (contextEntityType === "SERVICE_REQUEST") {
            const [row] = await db
                .select({ company_id: serviceRequests.company_id })
                .from(serviceRequests)
                .where(
                    and(
                        eq(serviceRequests.id, contextEntityId),
                        eq(serviceRequests.platform_id, platformId)
                    )
                )
                .limit(1);
            companyId = row?.company_id ?? null;
        }
    } else if (entityType && entityId) {
        if (entityType === "ORDER") {
            const [row] = await db
                .select({ company_id: orders.company_id })
                .from(orders)
                .where(and(eq(orders.id, entityId), eq(orders.platform_id, platformId)))
                .limit(1);
            companyId = row?.company_id ?? null;
        } else if (entityType === "INBOUND_REQUEST") {
            const [row] = await db
                .select({ company_id: inboundRequests.company_id })
                .from(inboundRequests)
                .where(
                    and(
                        eq(inboundRequests.id, entityId),
                        eq(inboundRequests.platform_id, platformId)
                    )
                )
                .limit(1);
            companyId = row?.company_id ?? null;
        } else if (entityType === "SERVICE_REQUEST") {
            const [row] = await db
                .select({ company_id: serviceRequests.company_id })
                .from(serviceRequests)
                .where(
                    and(
                        eq(serviceRequests.id, entityId),
                        eq(serviceRequests.platform_id, platformId)
                    )
                )
                .limit(1);
            companyId = row?.company_id ?? null;
        }
    }

    if (companyId) {
        const [company] = await db
            .select({ features: companies.features })
            .from(companies)
            .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)))
            .limit(1);
        const override = sanitizeCompanyAttachmentOverride(company?.features);
        if (override !== undefined) {
            enabled = override;
        }
    }

    return enabled;
};

const listAttachmentTypes = async (
    platformId: string,
    user: AuthUser,
    filters?: AttachmentTypeListFilters
) => {
    const attachmentsEnabled = await resolveAttachmentFeatureState(platformId, filters);
    const rows = await db
        .select()
        .from(attachmentTypes)
        .where(eq(attachmentTypes.platform_id, platformId))
        .orderBy(asc(attachmentTypes.sort_order), asc(attachmentTypes.label));

    if (user.role === "ADMIN" && !filters?.entity_type) {
        return rows;
    }

    if (!attachmentsEnabled) {
        return [];
    }

    const mode = filters?.mode || "view";

    return rows.filter((row) => {
        const entityMatch = filters?.entity_type
            ? row.allowed_entity_types.includes(filters.entity_type as any)
            : true;
        const roleMatch =
            mode === "upload"
                ? row.upload_roles.includes(user.role)
                : row.view_roles.includes(user.role);
        return entityMatch && roleMatch && row.is_active;
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
            required_note: payload.required_note ?? false,
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
            ...(payload.required_note !== undefined && { required_note: payload.required_note }),
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
