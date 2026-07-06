import { and, count, desc, eq, ilike, inArray, not } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assetConditionHistory,
    assets,
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
import { buildServiceRequestCode } from "../../utils/service-request-code";
import {
    ApplyServiceRequestConcessionPayload,
    ApplyFulfillmentOverridePayload,
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
import { PricingService } from "../../services/pricing.service";

const isRepairBeforeEventServiceRequest = (serviceRequest: {
    request_type: string;
    billing_mode: string;
    link_mode: string;
    blocks_fulfillment: boolean;
    related_order_id: string | null;
    related_order_item_id: string | null;
}) =>
    serviceRequest.request_type === "MAINTENANCE" &&
    serviceRequest.billing_mode === "INTERNAL_ONLY" &&
    serviceRequest.link_mode === "BUNDLED_WITH_ORDER" &&
    serviceRequest.blocks_fulfillment &&
    !!serviceRequest.related_order_id &&
    !!serviceRequest.related_order_item_id;

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

const assertServiceRequestAccess = (
    serviceRequest: { company_id: string; billing_mode: string },
    user: AuthUser
) => {
    if (user.role !== "CLIENT") return;
    if (!user.company_id || serviceRequest.company_id !== user.company_id) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "You do not have access to this service request"
        );
    }
    if (serviceRequest.billing_mode !== "CLIENT_BILLABLE") {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
    }
};

const getServiceRequestClientTotal = async (serviceRequest: {
    request_pricing_id: string | null;
    pricing_mode?: string | null;
}) => {
    // No-cost SRs bill the client zero (concession/client_sell_override_total
    // retired in 0073 — pricing_mode is the sole waiver signal).
    if (serviceRequest.pricing_mode === "NO_COST") return "0";
    if (!serviceRequest.request_pricing_id) return "0";
    const [pricing] = await db
        .select({
            breakdown_lines: prices.breakdown_lines,
            margin_percent: prices.margin_percent,
            vat_percent: prices.vat_percent,
            calculated_at: prices.calculated_at,
        })
        .from(prices)
        .where(eq(prices.id, serviceRequest.request_pricing_id))
        .limit(1);
    return String(
        PricingService.projectSummaryForRole(pricing as any, "CLIENT")?.final_total || "0"
    );
};

const getServiceRequestEventContext = async (serviceRequest: {
    id: string;
    service_request_id: string;
    company_id: string;
    request_type: string;
    billing_mode: string;
    related_order_id: string | null;
    request_pricing_id: string | null;
    pricing_mode?: string | null;
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
        request_url: "",
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
        pricing_mode?: string | null;
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
        pricing_mode?: string | null;
    },
    nextStatus: string
) => {
    if (!["IN_PROGRESS", "COMPLETED"].includes(nextStatus)) return;
    if (serviceRequest.billing_mode !== "CLIENT_BILLABLE") return;
    const commerciallyCleared =
        ["QUOTE_APPROVED", "INVOICED", "PAID"].includes(serviceRequest.commercial_status) ||
        serviceRequest.pricing_mode === "NO_COST";
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
    const {
        page,
        limit,
        search_term,
        company_id,
        request_status,
        request_type,
        billing_mode,
        related_order_id,
        repair_before_event,
    } = query;
    const { pageNumber, limitNumber, skip } = paginationMaker({ page, limit });

    const conditions = [eq(serviceRequests.platform_id, platformId)];
    if (user.role === "CLIENT") {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "Client account has no company access");
        }
        conditions.push(eq(serviceRequests.company_id, user.company_id));
        // Clients only see their own CLIENT_BILLABLE SRs — internal maintenance SRs are hidden
        conditions.push(eq(serviceRequests.billing_mode, "CLIENT_BILLABLE"));
    } else if (company_id) {
        conditions.push(eq(serviceRequests.company_id, company_id));
    }
    if (request_status) conditions.push(eq(serviceRequests.request_status, request_status));
    if (request_type) conditions.push(eq(serviceRequests.request_type, request_type));
    if (billing_mode) conditions.push(eq(serviceRequests.billing_mode, billing_mode));
    if (repair_before_event === "true" || repair_before_event === true) {
        conditions.push(eq(serviceRequests.request_type, "MAINTENANCE"));
        conditions.push(eq(serviceRequests.billing_mode, "INTERNAL_ONLY"));
        conditions.push(eq(serviceRequests.link_mode, "BUNDLED_WITH_ORDER"));
        conditions.push(eq(serviceRequests.blocks_fulfillment, true));
    }
    if (search_term) conditions.push(ilike(serviceRequests.title, `%${search_term.trim()}%`));
    if (related_order_id) conditions.push(eq(serviceRequests.related_order_id, related_order_id));

    const [rows, total] = await Promise.all([
        db
            .select({
                service_request: serviceRequests,
                request_pricing: {
                    breakdown_lines: prices.breakdown_lines,
                    margin_percent: prices.margin_percent,
                    vat_percent: prices.vat_percent,
                    calculated_at: prices.calculated_at,
                },
            })
            .from(serviceRequests)
            .leftJoin(prices, eq(serviceRequests.request_pricing_id, prices.id))
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
        data: rows.map((row) => ({
            ...row.service_request,
            is_repair_before_event: isRepairBeforeEventServiceRequest(row.service_request as any),
            request_pricing: PricingService.projectSummaryForRole(
                row.request_pricing as any,
                user.role as any
            ),
        })),
    };
};

const getServiceRequestById = async (id: string, platformId: string, user: AuthUser) => {
    const serviceRequest = await getServiceRequestInternal(id, platformId);
    assertServiceRequestAccess(serviceRequest, user);
    const pricingRow = serviceRequest.request_pricing_id
        ? await db
              .select({
                  breakdown_lines: prices.breakdown_lines,
                  margin_percent: prices.margin_percent,
                  vat_percent: prices.vat_percent,
                  calculated_at: prices.calculated_at,
              })
              .from(prices)
              .where(eq(prices.id, serviceRequest.request_pricing_id))
              .limit(1)
              .then((rows) => rows[0] || null)
        : null;

    // Admin receives all three role projections nested under `projections`
    // so the breakdown card can preview Logistics + Client. Non-admins get
    // only their own projection.
    const srBaseProjection = PricingService.projectByRole(pricingRow as any, user.role as any);
    const srAdminProjections =
        user.role === "ADMIN" ? PricingService.projectAllRolesForAdmin(pricingRow as any) : null;
    const srPricingPayload =
        user.role === "ADMIN" && srAdminProjections
            ? { ...(srBaseProjection as any), projections: srAdminProjections }
            : srBaseProjection;

    return {
        ...serviceRequest,
        is_repair_before_event: isRepairBeforeEventServiceRequest(serviceRequest as any),
        request_pricing: srPricingPayload,
    };
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

    // Duplicate guard — prevent creating multiple SRs for the same order item
    if (payload.related_order_item_id) {
        const [existingSR] = await db
            .select({
                id: serviceRequests.id,
                service_request_id: serviceRequests.service_request_id,
            })
            .from(serviceRequests)
            .where(
                and(
                    eq(serviceRequests.related_order_item_id, payload.related_order_item_id),
                    not(inArray(serviceRequests.request_status, ["CANCELLED"]))
                )
            )
            .limit(1);
        if (existingSR) {
            throw new CustomizedError(
                httpStatus.CONFLICT,
                `Service request ${existingSR.service_request_id} already exists for this order item. Cancel it first to create a new one.`
            );
        }
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
    if (payload.photos !== undefined) updatePayload.photos = payload.photos;
    if (payload.work_notes !== undefined) updatePayload.work_notes = payload.work_notes;
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
        // Re-quoting un-waives a previously no-cost SR (concession_* columns
        // retired in 0073 — pricing_mode is the sole waiver signal now).
        updatePayload.pricing_mode = "STANDARD";
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

    if (payload.to_status === "COMPLETED" && isRepairBeforeEventServiceRequest(existing as any)) {
        const completionNotes = (payload.completion_notes || payload.note || "").trim();
        const photos = Array.isArray(existing.photos) ? existing.photos : [];
        if (!completionNotes) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Completion notes are required for Repair Before Event tasks"
            );
        }
        if (photos.length === 0) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "At least one work photo is required before completing a Repair Before Event task"
            );
        }
    }

    const updatePayload: Record<string, any> = {
        request_status: payload.to_status,
        updated_at: new Date(),
    };

    if (payload.to_status === "COMPLETED") {
        updatePayload.completed_at = new Date();
        updatePayload.completed_by = user.id;
        updatePayload.completion_notes = payload.completion_notes || payload.note || null;
    }

    // Wrap SR status update + asset condition restore in a single transaction so they
    // succeed or fail together — prevents partial state (SR completed but asset still RED)
    await db.transaction(async (tx) => {
        await tx.update(serviceRequests).set(updatePayload).where(eq(serviceRequests.id, id));

        await tx.insert(serviceRequestStatusHistory).values({
            service_request_id: id,
            platform_id: platformId,
            from_status: existing.request_status,
            to_status: payload.to_status,
            note: payload.note || null,
            changed_by: user.id,
        });

        // Auto-restore asset condition to GREEN when maintenance SR is completed
        if (
            payload.to_status === "COMPLETED" &&
            existing.request_type === "MAINTENANCE" &&
            existing.related_asset_id
        ) {
            const conditionPhotos = Array.isArray(existing.photos) ? existing.photos : [];
            const conditionNotes = [
                `Restored to GREEN — SR ${existing.service_request_id} completed`,
                existing.work_notes ? `Work notes: ${existing.work_notes}` : null,
                payload.completion_notes ? `Completion: ${payload.completion_notes}` : null,
            ]
                .filter(Boolean)
                .join(". ");

            await tx
                .update(assets)
                .set({
                    condition: "GREEN",
                    condition_notes: existing.work_notes || null,
                    refurb_days_estimate: null,
                    updated_at: new Date(),
                })
                .where(eq(assets.id, existing.related_asset_id));

            await tx.insert(assetConditionHistory).values({
                platform_id: platformId,
                asset_id: existing.related_asset_id,
                condition: "GREEN",
                notes: conditionNotes,
                photos: conditionPhotos,
                damage_report_entries: [],
                updated_by: user.id,
            });
        }
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
    if (isRepairBeforeEventServiceRequest(existing as any)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Repair Before Event tasks cannot be cancelled directly. Use the admin fulfillment exception or approve a client decision change."
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
            // Reverting to PENDING_QUOTE un-waives any prior no-cost decision
            // (concession_* columns retired in 0073 — pricing_mode is the signal).
            pricing_mode: "STANDARD",
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

    // Concession is now the SR "mark no-cost" gesture (Phase 1, P1-8): void line
    // items + zero the prices row + flip pricing_mode=NO_COST via the shared
    // entity-agnostic helper, then revert commercial_status to PENDING_QUOTE
    // (the original concession-revert semantics are preserved). The legacy
    // concession columns (client_sell_override_total / concession_*) were dropped
    // in migration 0073; reports read pricing_mode=NO_COST for the SR sell-zero
    // arm (P1-9).
    await db.transaction(async (tx) => {
        await PricingService.markEntityAsNoCost({
            entityType: "SERVICE_REQUEST",
            entityId: id,
            platformId,
            actorId: user.id,
            tx,
        });

        await tx
            .update(serviceRequests)
            .set({
                commercial_status: "PENDING_QUOTE",
                updated_at: new Date(),
            })
            .where(eq(serviceRequests.id, id));

        await tx.insert(serviceRequestStatusHistory).values({
            service_request_id: id,
            platform_id: platformId,
            from_status: existing.request_status,
            to_status: existing.request_status,
            note: `Marked no-cost (concession): ${payload.concession_reason}`,
            changed_by: user.id,
        });
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

const applyFulfillmentOverride = async (
    id: string,
    payload: ApplyFulfillmentOverridePayload,
    platformId: string,
    user: AuthUser
) => {
    if (user.role !== "ADMIN") {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only admins can approve fulfillment exceptions"
        );
    }

    const existing = await getServiceRequestInternal(id, platformId);
    if (!isRepairBeforeEventServiceRequest(existing as any)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Fulfillment exceptions are only available for Repair Before Event tasks"
        );
    }
    if (existing.request_status === "COMPLETED" || existing.request_status === "CANCELLED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Completed or cancelled service requests cannot receive a fulfillment exception"
        );
    }
    if (existing.fulfillment_override_applied_at) {
        return existing;
    }

    const now = new Date();
    await db.transaction(async (tx) => {
        await tx
            .update(serviceRequests)
            .set({
                fulfillment_override_reason: payload.reason,
                fulfillment_override_approved_by: user.id,
                fulfillment_override_applied_at: now,
                updated_at: now,
            })
            .where(eq(serviceRequests.id, id));

        await tx.insert(serviceRequestStatusHistory).values({
            service_request_id: id,
            platform_id: platformId,
            from_status: existing.request_status,
            to_status: existing.request_status,
            note: `Fulfillment exception approved: ${payload.reason}`,
            changed_by: user.id,
        });
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
    respondToServiceRequestQuote,
    applyServiceRequestConcession,
    applyFulfillmentOverride,
};
