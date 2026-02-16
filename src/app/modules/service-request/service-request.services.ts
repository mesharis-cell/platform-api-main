import { and, count, desc, eq, gte, ilike, lt } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    serviceRequestItems,
    serviceRequestStatusHistory,
    serviceRequests,
    users,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import {
    ApproveServiceRequestQuotePayload,
    CancelServiceRequestPayload,
    CreateServiceRequestPayload,
    UpdateServiceRequestPayload,
    UpdateServiceRequestCommercialStatusPayload,
    UpdateServiceRequestStatusPayload,
} from "./service-request.interfaces";
import {
    assertClientCanApproveServiceRequestQuote,
    assertServiceRequestCommercialTransition,
    assertServiceRequestStatusTransition,
} from "../../utils/commercial-policy";

const buildServiceRequestCode = async (platformId: string) => {
    const now = new Date();
    const dateCode = `${now.getFullYear()}${`${now.getMonth() + 1}`.padStart(2, "0")}${`${now.getDate()}`.padStart(2, "0")}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [todayCount] = await db
        .select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.platform_id, platformId),
                gte(serviceRequests.created_at, start),
                lt(serviceRequests.created_at, end)
            )
        );

    const sequence = `${Number(todayCount?.count || 0) + 1}`.padStart(4, "0");
    return `SR-${dateCode}-${sequence}`;
};

const getServiceRequestInternal = async (id: string, platformId: string) => {
    const [serviceRequest] = await db
        .select()
        .from(serviceRequests)
        .where(and(eq(serviceRequests.id, id), eq(serviceRequests.platform_id, platformId)))
        .limit(1);

    if (!serviceRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
    }

    const [items, history] = await Promise.all([
        db
            .select()
            .from(serviceRequestItems)
            .where(eq(serviceRequestItems.service_request_id, id))
            .orderBy(desc(serviceRequestItems.created_at)),
        db
            .select({
                id: serviceRequestStatusHistory.id,
                from_status: serviceRequestStatusHistory.from_status,
                to_status: serviceRequestStatusHistory.to_status,
                note: serviceRequestStatusHistory.note,
                changed_at: serviceRequestStatusHistory.changed_at,
                changed_by: serviceRequestStatusHistory.changed_by,
                changed_by_user: {
                    id: users.id,
                    name: users.name,
                },
            })
            .from(serviceRequestStatusHistory)
            .leftJoin(users, eq(serviceRequestStatusHistory.changed_by, users.id))
            .where(eq(serviceRequestStatusHistory.service_request_id, id))
            .orderBy(desc(serviceRequestStatusHistory.changed_at)),
    ]);

    return {
        ...serviceRequest,
        items,
        status_history: history,
    };
};

const assertServiceRequestAccess = (serviceRequest: { company_id: string }, user: AuthUser) => {
    if (user.role !== "CLIENT") return;
    if (!user.company_id || serviceRequest.company_id !== user.company_id) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "You do not have access to this service request"
        );
    }
};

const listServiceRequests = async (
    query: Record<string, any>,
    platformId: string,
    user: AuthUser
) => {
    const { page, limit, search_term, company_id, request_status, request_type, billing_mode } =
        query;
    const { pageNumber, limitNumber, skip } = paginationMaker({ page, limit });

    const conditions = [eq(serviceRequests.platform_id, platformId)];
    if (user.role === "CLIENT") {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "Client account has no company access");
        }
        conditions.push(eq(serviceRequests.company_id, user.company_id));
    } else if (company_id) {
        conditions.push(eq(serviceRequests.company_id, company_id));
    }
    if (request_status) conditions.push(eq(serviceRequests.request_status, request_status));
    if (request_type) conditions.push(eq(serviceRequests.request_type, request_type));
    if (billing_mode) conditions.push(eq(serviceRequests.billing_mode, billing_mode));
    if (search_term) conditions.push(ilike(serviceRequests.title, `%${search_term.trim()}%`));

    const [rows, total] = await Promise.all([
        db
            .select()
            .from(serviceRequests)
            .where(and(...conditions))
            .orderBy(desc(serviceRequests.created_at))
            .limit(limitNumber)
            .offset(skip),
        db
            .select({ count: count() })
            .from(serviceRequests)
            .where(and(...conditions)),
    ]);

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: Number(total[0]?.count || 0),
        },
        data: rows,
    };
};

const getServiceRequestById = async (id: string, platformId: string, user: AuthUser) => {
    const serviceRequest = await getServiceRequestInternal(id, platformId);
    assertServiceRequestAccess(serviceRequest, user);
    return serviceRequest;
};

const createServiceRequest = async (
    payload: CreateServiceRequestPayload,
    platformId: string,
    user: AuthUser
) => {
    const companyId =
        user.role === "CLIENT" ? user.company_id : (payload.company_id as string | undefined);
    if (!companyId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    if (user.role === "CLIENT" && payload.company_id && payload.company_id !== user.company_id) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "You can only create service requests for your own company"
        );
    }

    const code = await buildServiceRequestCode(platformId);
    const initialStatus = "SUBMITTED";
    const billingMode = user.role === "CLIENT" ? "CLIENT_BILLABLE" : payload.billing_mode;
    const initialCommercialStatus =
        billingMode === "CLIENT_BILLABLE" ? "PENDING_QUOTE" : "INTERNAL";

    const [created] = await db
        .insert(serviceRequests)
        .values({
            service_request_id: code,
            platform_id: platformId,
            company_id: companyId,
            request_type: payload.request_type,
            billing_mode: billingMode,
            request_status: initialStatus,
            commercial_status: initialCommercialStatus,
            title: payload.title,
            description: payload.description || null,
            related_asset_id: payload.related_asset_id || null,
            related_order_id: payload.related_order_id || null,
            related_order_item_id: payload.related_order_item_id || null,
            requested_start_at: payload.requested_start_at
                ? new Date(payload.requested_start_at)
                : null,
            requested_due_at: payload.requested_due_at ? new Date(payload.requested_due_at) : null,
            created_by: user.id,
        })
        .returning();

    if (payload.items.length > 0) {
        await db.insert(serviceRequestItems).values(
            payload.items.map((item) => ({
                service_request_id: created.id,
                asset_id: item.asset_id || null,
                asset_name: item.asset_name,
                quantity: item.quantity ?? 1,
                notes: item.notes || null,
                refurb_days_estimate: item.refurb_days_estimate ?? null,
            }))
        );
    }

    await db.insert(serviceRequestStatusHistory).values({
        service_request_id: created.id,
        platform_id: platformId,
        from_status: null,
        to_status: initialStatus,
        note: "Service request created",
        changed_by: user.id,
    });

    return getServiceRequestInternal(created.id, platformId);
};

const updateServiceRequest = async (
    id: string,
    payload: UpdateServiceRequestPayload,
    platformId: string,
    user: AuthUser
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot update service requests");
    }

    const existing = await getServiceRequestInternal(id, platformId);
    if (existing.request_status === "COMPLETED" || existing.request_status === "CANCELLED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Completed or cancelled service requests cannot be edited"
        );
    }

    const updatePayload: Record<string, any> = {};
    if (payload.billing_mode !== undefined) {
        updatePayload.billing_mode = payload.billing_mode;
        if (
            existing.commercial_status === "INTERNAL" ||
            existing.commercial_status === "PENDING_QUOTE"
        ) {
            updatePayload.commercial_status =
                payload.billing_mode === "CLIENT_BILLABLE" ? "PENDING_QUOTE" : "INTERNAL";
        }
    }
    if (payload.title !== undefined) updatePayload.title = payload.title;
    if (payload.description !== undefined) updatePayload.description = payload.description;
    if (payload.related_asset_id !== undefined)
        updatePayload.related_asset_id = payload.related_asset_id;
    if (payload.requested_start_at !== undefined) {
        updatePayload.requested_start_at = payload.requested_start_at
            ? new Date(payload.requested_start_at)
            : null;
    }
    if (payload.requested_due_at !== undefined) {
        updatePayload.requested_due_at = payload.requested_due_at
            ? new Date(payload.requested_due_at)
            : null;
    }
    if (Object.keys(updatePayload).length > 0) {
        updatePayload.updated_at = new Date();
        await db.update(serviceRequests).set(updatePayload).where(eq(serviceRequests.id, id));
    }

    if (payload.items) {
        await db.delete(serviceRequestItems).where(eq(serviceRequestItems.service_request_id, id));
        await db.insert(serviceRequestItems).values(
            payload.items.map((item) => ({
                service_request_id: id,
                asset_id: item.asset_id || null,
                asset_name: item.asset_name,
                quantity: item.quantity ?? 1,
                notes: item.notes || null,
                refurb_days_estimate: item.refurb_days_estimate ?? null,
            }))
        );
    }

    return getServiceRequestInternal(id, platformId);
};

const updateServiceRequestStatus = async (
    id: string,
    payload: UpdateServiceRequestStatusPayload,
    platformId: string,
    user: AuthUser
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Clients cannot update service request statuses"
        );
    }

    const existing = await getServiceRequestInternal(id, platformId);
    if (existing.request_status === "CANCELLED" || existing.request_status === "COMPLETED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Completed or cancelled service requests cannot change status"
        );
    }

    if (existing.request_status === payload.to_status) {
        return existing;
    }
    assertServiceRequestStatusTransition(existing.request_status as any, payload.to_status as any);

    const updatePayload: Record<string, any> = {
        request_status: payload.to_status,
        updated_at: new Date(),
    };

    if (payload.to_status === "COMPLETED") {
        updatePayload.completed_at = new Date();
        updatePayload.completed_by = user.id;
        updatePayload.completion_notes = payload.completion_notes || payload.note || null;
    }

    await db.update(serviceRequests).set(updatePayload).where(eq(serviceRequests.id, id));

    await db.insert(serviceRequestStatusHistory).values({
        service_request_id: id,
        platform_id: platformId,
        from_status: existing.request_status,
        to_status: payload.to_status,
        note: payload.note || null,
        changed_by: user.id,
    });

    return getServiceRequestInternal(id, platformId);
};

const cancelServiceRequest = async (
    id: string,
    payload: CancelServiceRequestPayload,
    platformId: string,
    user: AuthUser
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot cancel service requests");
    }

    const existing = await getServiceRequestInternal(id, platformId);
    if (existing.request_status === "CANCELLED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Service request is already cancelled");
    }
    if (existing.request_status === "COMPLETED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Completed service requests cannot be cancelled"
        );
    }

    await db
        .update(serviceRequests)
        .set({
            request_status: "CANCELLED",
            commercial_status: "CANCELLED",
            cancelled_at: new Date(),
            cancelled_by: user.id,
            cancellation_reason: payload.cancellation_reason,
            updated_at: new Date(),
        })
        .where(eq(serviceRequests.id, id));

    await db.insert(serviceRequestStatusHistory).values({
        service_request_id: id,
        platform_id: platformId,
        from_status: existing.request_status,
        to_status: "CANCELLED",
        note: payload.cancellation_reason,
        changed_by: user.id,
    });

    return getServiceRequestInternal(id, platformId);
};

const updateServiceRequestCommercialStatus = async (
    id: string,
    payload: UpdateServiceRequestCommercialStatusPayload,
    platformId: string,
    user: AuthUser
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot update commercial status");
    }

    const existing = await getServiceRequestInternal(id, platformId);
    assertServiceRequestCommercialTransition(
        existing.commercial_status as any,
        payload.commercial_status as any,
        existing.billing_mode as any
    );

    await db
        .update(serviceRequests)
        .set({
            commercial_status: payload.commercial_status,
            updated_at: new Date(),
        })
        .where(eq(serviceRequests.id, id));

    await db.insert(serviceRequestStatusHistory).values({
        service_request_id: id,
        platform_id: platformId,
        from_status: existing.request_status,
        to_status: existing.request_status,
        note:
            payload.note ||
            `Commercial status changed to ${payload.commercial_status.replace(/_/g, " ")}`,
        changed_by: user.id,
    });

    return getServiceRequestInternal(id, platformId);
};

const approveServiceRequestQuote = async (
    id: string,
    payload: ApproveServiceRequestQuotePayload,
    platformId: string,
    user: AuthUser
) => {
    if (user.role !== "CLIENT") {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only clients can approve service request quotes"
        );
    }

    const existing = await getServiceRequestInternal(id, platformId);
    assertServiceRequestAccess(existing, user);

    assertClientCanApproveServiceRequestQuote(
        existing.billing_mode as any,
        existing.commercial_status as any
    );
    assertServiceRequestCommercialTransition(
        existing.commercial_status as any,
        "QUOTE_APPROVED",
        existing.billing_mode as any
    );

    await db
        .update(serviceRequests)
        .set({
            commercial_status: "QUOTE_APPROVED",
            updated_at: new Date(),
        })
        .where(eq(serviceRequests.id, id));

    await db.insert(serviceRequestStatusHistory).values({
        service_request_id: id,
        platform_id: platformId,
        from_status: existing.request_status,
        to_status: existing.request_status,
        note: payload.note || "Client approved service request quote",
        changed_by: user.id,
    });

    return getServiceRequestInternal(id, platformId);
};

export const ServiceRequestServices = {
    listServiceRequests,
    getServiceRequestById,
    createServiceRequest,
    updateServiceRequest,
    updateServiceRequestStatus,
    cancelServiceRequest,
    updateServiceRequestCommercialStatus,
    approveServiceRequestQuote,
};
