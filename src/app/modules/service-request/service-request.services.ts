import { and, count, desc, eq, gte, ilike, lt } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    orders,
    prices,
    serviceRequestItems,
    serviceRequestStatusHistory,
    serviceRequests,
    users,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import {
    ApplyServiceRequestConcessionPayload,
    ApproveServiceRequestQuotePayload,
    CancelServiceRequestPayload,
    CreateServiceRequestPayload,
    RespondServiceRequestQuotePayload,
    UpdateServiceRequestPayload,
    UpdateServiceRequestCommercialStatusPayload,
    UpdateServiceRequestStatusPayload,
} from "./service-request.interfaces";
import {
    assertClientCanApproveServiceRequestQuote,
    assertServiceRequestCommercialTransition,
    assertServiceRequestStatusTransition,
} from "../../utils/commercial-policy";
import { eventBus } from "../../events/event-bus";
import { EVENT_TYPES } from "../../events/event-types";
import config from "../../config";

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

const getServiceRequestClientTotal = async (serviceRequest: {
    request_pricing_id: string | null;
    client_sell_override_total?: string | null;
}) => {
    if (
        serviceRequest.client_sell_override_total !== null &&
        serviceRequest.client_sell_override_total
    ) {
        return String(serviceRequest.client_sell_override_total);
    }
    if (!serviceRequest.request_pricing_id) return "0";
    const [pricing] = await db
        .select({ final_total: prices.final_total })
        .from(prices)
        .where(eq(prices.id, serviceRequest.request_pricing_id))
        .limit(1);
    return String(pricing?.final_total || "0");
};

const getServiceRequestEventContext = async (serviceRequest: {
    id: string;
    service_request_id: string;
    company_id: string;
    request_type: string;
    billing_mode: string;
    related_order_id: string | null;
    request_pricing_id: string | null;
    client_sell_override_total?: string | null;
}) => {
    const [company, relatedOrder, finalTotal] = await Promise.all([
        db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, serviceRequest.company_id))
            .limit(1)
            .then((rows) => rows[0]),
        serviceRequest.related_order_id
            ? db
                  .select({ contact_name: orders.contact_name })
                  .from(orders)
                  .where(eq(orders.id, serviceRequest.related_order_id))
                  .limit(1)
                  .then((rows) => rows[0] || null)
            : Promise.resolve(null),
        getServiceRequestClientTotal(serviceRequest),
    ]);

    return {
        entity_id_readable: serviceRequest.service_request_id,
        company_id: serviceRequest.company_id,
        company_name: company?.name || "N/A",
        request_type: serviceRequest.request_type,
        billing_mode: serviceRequest.billing_mode,
        contact_name: relatedOrder?.contact_name || "Client",
        final_total: finalTotal,
        request_url: `${config.client_url}/service-requests/${serviceRequest.id}`,
    };
};

const emitServiceRequestEvent = async (
    platformId: string,
    eventType: string,
    serviceRequest: {
        id: string;
        service_request_id: string;
        company_id: string;
        request_type: string;
        billing_mode: string;
        related_order_id: string | null;
        request_pricing_id: string | null;
        client_sell_override_total?: string | null;
    },
    actor: AuthUser,
    payloadExtras: Record<string, unknown> = {}
) => {
    const basePayload = await getServiceRequestEventContext(serviceRequest);
    await eventBus.emit({
        platform_id: platformId,
        event_type: eventType,
        entity_type: "SERVICE_REQUEST",
        entity_id: serviceRequest.id,
        actor_id: actor.id,
        actor_role: actor.role,
        payload: {
            ...basePayload,
            ...payloadExtras,
        },
    });
};

const assertOperationalCommercialCoupling = (
    serviceRequest: {
        billing_mode: string;
        commercial_status: string;
        concession_applied_at?: Date | null;
    },
    nextStatus: string
) => {
    if (!["IN_PROGRESS", "COMPLETED"].includes(nextStatus)) return;
    if (serviceRequest.billing_mode !== "CLIENT_BILLABLE") return;
    const commerciallyCleared =
        ["QUOTE_APPROVED", "INVOICED", "PAID"].includes(serviceRequest.commercial_status) ||
        !!serviceRequest.concession_applied_at;
    if (commerciallyCleared) return;
    throw new CustomizedError(
        httpStatus.BAD_REQUEST,
        "Billable service request cannot progress operationally before commercial approval"
    );
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
    let companyId =
        user.role === "CLIENT" ? user.company_id : (payload.company_id as string | undefined);
    if (!companyId && payload.related_order_id) {
        const [relatedOrder] = await db
            .select({ company_id: orders.company_id })
            .from(orders)
            .where(and(eq(orders.id, payload.related_order_id), eq(orders.platform_id, platformId)))
            .limit(1);
        if (relatedOrder?.company_id) companyId = relatedOrder.company_id;
    }
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
    const linkMode = payload.link_mode || "STANDALONE";
    const blocksFulfillment =
        payload.blocks_fulfillment ??
        (linkMode !== "STANDALONE" && payload.request_type === "RESKIN");

    const [created] = await db
        .insert(serviceRequests)
        .values({
            service_request_id: code,
            platform_id: platformId,
            company_id: companyId,
            request_type: payload.request_type,
            billing_mode: billingMode,
            link_mode: linkMode,
            blocks_fulfillment: blocksFulfillment,
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

    await emitServiceRequestEvent(
        platformId,
        EVENT_TYPES.SERVICE_REQUEST_SUBMITTED,
        created as any,
        user
    );

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
    let shouldEmitQuoteRevised = false;
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
    if (payload.link_mode !== undefined) updatePayload.link_mode = payload.link_mode;
    if (payload.blocks_fulfillment !== undefined)
        updatePayload.blocks_fulfillment = payload.blocks_fulfillment;
    if (payload.title !== undefined) updatePayload.title = payload.title;
    if (payload.description !== undefined) updatePayload.description = payload.description;
    if (payload.related_asset_id !== undefined)
        updatePayload.related_asset_id = payload.related_asset_id;
    if (payload.related_order_id !== undefined)
        updatePayload.related_order_id = payload.related_order_id;
    if (payload.related_order_item_id !== undefined)
        updatePayload.related_order_item_id = payload.related_order_item_id;
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
    if (
        payload.items &&
        existing.billing_mode === "CLIENT_BILLABLE" &&
        ["QUOTED", "QUOTE_APPROVED", "INVOICED", "PAID"].includes(existing.commercial_status)
    ) {
        updatePayload.commercial_status = "PENDING_QUOTE";
        updatePayload.client_sell_override_total = null;
        updatePayload.concession_reason = null;
        updatePayload.concession_approved_by = null;
        updatePayload.concession_applied_at = null;
        shouldEmitQuoteRevised = true;
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

    if (shouldEmitQuoteRevised) {
        const refreshed = await getServiceRequestInternal(id, platformId);
        await emitServiceRequestEvent(
            platformId,
            EVENT_TYPES.SERVICE_REQUEST_QUOTE_REVISED,
            refreshed as any,
            user,
            { revision_reason: "Line items updated after quote was already issued" }
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
    assertOperationalCommercialCoupling(existing as any, payload.to_status);

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

    if (payload.to_status === "COMPLETED") {
        const refreshed = await getServiceRequestInternal(id, platformId);
        await emitServiceRequestEvent(
            platformId,
            EVENT_TYPES.SERVICE_REQUEST_COMPLETED,
            refreshed as any,
            user
        );
    }

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

    const refreshed = await getServiceRequestInternal(id, platformId);
    if (payload.commercial_status === "QUOTED") {
        await emitServiceRequestEvent(
            platformId,
            EVENT_TYPES.SERVICE_REQUEST_QUOTED,
            refreshed as any,
            user
        );
    }
    if (payload.commercial_status === "PENDING_QUOTE" && existing.commercial_status === "QUOTED") {
        await emitServiceRequestEvent(
            platformId,
            EVENT_TYPES.SERVICE_REQUEST_QUOTE_REVISED,
            refreshed as any,
            user,
            { revision_reason: payload.revision_reason || payload.note || null }
        );
    }
    if (payload.commercial_status === "QUOTE_APPROVED") {
        await emitServiceRequestEvent(
            platformId,
            EVENT_TYPES.SERVICE_REQUEST_APPROVED,
            refreshed as any,
            user
        );
    }

    return refreshed;
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

    const refreshed = await getServiceRequestInternal(id, platformId);
    await emitServiceRequestEvent(
        platformId,
        EVENT_TYPES.SERVICE_REQUEST_APPROVED,
        refreshed as any,
        user
    );
    return refreshed;
};

const respondToServiceRequestQuote = async (
    id: string,
    payload: RespondServiceRequestQuotePayload,
    platformId: string,
    user: AuthUser
) => {
    if (payload.action === "APPROVE") {
        return approveServiceRequestQuote(id, { note: payload.note }, platformId, user);
    }

    if (user.role !== "CLIENT") {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only clients can respond to service request quotes"
        );
    }

    const existing = await getServiceRequestInternal(id, platformId);
    assertServiceRequestAccess(existing, user);
    if (existing.billing_mode !== "CLIENT_BILLABLE") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Only client-billable service requests support quote responses"
        );
    }

    if (!["QUOTED", "PENDING_QUOTE"].includes(existing.commercial_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot respond to quote from commercial status ${existing.commercial_status}`
        );
    }

    assertServiceRequestCommercialTransition(
        existing.commercial_status as any,
        "PENDING_QUOTE",
        existing.billing_mode as any
    );

    await db
        .update(serviceRequests)
        .set({
            commercial_status: "PENDING_QUOTE",
            client_sell_override_total: null,
            concession_reason: null,
            concession_approved_by: null,
            concession_applied_at: null,
            updated_at: new Date(),
        })
        .where(eq(serviceRequests.id, id));

    const actionLabel =
        payload.action === "DECLINE"
            ? "Client declined quote (non-terminal)"
            : "Client requested quote revision";
    await db.insert(serviceRequestStatusHistory).values({
        service_request_id: id,
        platform_id: platformId,
        from_status: existing.request_status,
        to_status: existing.request_status,
        note: payload.note || actionLabel,
        changed_by: user.id,
    });

    const refreshed = await getServiceRequestInternal(id, platformId);
    await emitServiceRequestEvent(
        platformId,
        EVENT_TYPES.SERVICE_REQUEST_QUOTE_REVISED,
        refreshed as any,
        user,
        { revision_reason: payload.note || actionLabel }
    );
    return refreshed;
};

const applyServiceRequestConcession = async (
    id: string,
    payload: ApplyServiceRequestConcessionPayload,
    platformId: string,
    user: AuthUser
) => {
    if (user.role === "CLIENT") {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Clients cannot apply concessions");
    }

    const existing = await getServiceRequestInternal(id, platformId);
    if (existing.billing_mode !== "CLIENT_BILLABLE") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Concession is only available for client-billable service requests"
        );
    }

    await db
        .update(serviceRequests)
        .set({
            commercial_status: "PENDING_QUOTE",
            client_sell_override_total: "0.00",
            concession_reason: payload.concession_reason,
            concession_approved_by: user.id,
            concession_applied_at: new Date(),
            updated_at: new Date(),
        })
        .where(eq(serviceRequests.id, id));

    await db.insert(serviceRequestStatusHistory).values({
        service_request_id: id,
        platform_id: platformId,
        from_status: existing.request_status,
        to_status: existing.request_status,
        note: `Client concession applied: ${payload.concession_reason}`,
        changed_by: user.id,
    });

    const refreshed = await getServiceRequestInternal(id, platformId);
    await emitServiceRequestEvent(
        platformId,
        EVENT_TYPES.SERVICE_REQUEST_QUOTE_REVISED,
        refreshed as any,
        user,
        { revision_reason: `Concession applied: ${payload.concession_reason}` }
    );
    return refreshed;
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
    respondToServiceRequestQuote,
    applyServiceRequestConcession,
};
