import { and, desc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    inboundRequests,
    lineItemRequests,
    orders,
    serviceRequests,
    serviceTypes,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import {
    ApproveLineItemRequestPayload,
    CreateLineItemRequestPayload,
    RejectLineItemRequestPayload,
} from "./line-item-requests.interfaces";
import { lineItemRequestIdGenerator } from "./line-item-requests.utils";
import { eventBus } from "../../events/event-bus";
import { EVENT_TYPES } from "../../events/event-types";
import { LineItemsServices } from "../order-line-items/order-line-items.services";

type SupportedPurpose = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "SELF_PICKUP";

type ResolvedTarget = {
    purpose_type: SupportedPurpose;
    target_id: string;
    company_id: string;
};

const asNumber = (value: unknown) => Number(value || 0);

const formatRequestRow = (row: typeof lineItemRequests.$inferSelect) => ({
    ...row,
    quantity: asNumber(row.quantity),
    unit_rate: asNumber(row.unit_rate),
    reviewed_quantity: row.reviewed_quantity !== null ? asNumber(row.reviewed_quantity) : null,
    reviewed_unit_rate: row.reviewed_unit_rate !== null ? asNumber(row.reviewed_unit_rate) : null,
});

const resolveTarget = async (
    purposeType: SupportedPurpose,
    ids: {
        order_id?: string | null;
        inbound_request_id?: string | null;
        service_request_id?: string | null;
    },
    platformId: string
): Promise<ResolvedTarget> => {
    if (purposeType === "ORDER") {
        const targetId = ids.order_id;
        if (!targetId) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "order_id is required for ORDER");
        }
        const [order] = await db
            .select({ id: orders.id, company_id: orders.company_id })
            .from(orders)
            .where(and(eq(orders.id, targetId), eq(orders.platform_id, platformId)))
            .limit(1);
        if (!order) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
        }
        return {
            purpose_type: purposeType,
            target_id: order.id,
            company_id: order.company_id,
        };
    }

    if (purposeType === "INBOUND_REQUEST") {
        const targetId = ids.inbound_request_id;
        if (!targetId) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "inbound_request_id is required for INBOUND_REQUEST"
            );
        }
        const [request] = await db
            .select({ id: inboundRequests.id, company_id: inboundRequests.company_id })
            .from(inboundRequests)
            .where(
                and(eq(inboundRequests.id, targetId), eq(inboundRequests.platform_id, platformId))
            )
            .limit(1);
        if (!request) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
        }
        return {
            purpose_type: purposeType,
            target_id: request.id,
            company_id: request.company_id,
        };
    }

    const targetId = ids.service_request_id;
    if (!targetId) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "service_request_id is required for SERVICE_REQUEST"
        );
    }
    const [request] = await db
        .select({ id: serviceRequests.id, company_id: serviceRequests.company_id })
        .from(serviceRequests)
        .where(and(eq(serviceRequests.id, targetId), eq(serviceRequests.platform_id, platformId)))
        .limit(1);
    if (!request) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
    }
    return {
        purpose_type: purposeType,
        target_id: request.id,
        company_id: request.company_id,
    };
};

const getCompanyName = async (companyId: string) => {
    const [company] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
    return company?.name || "";
};

const listLineItemRequests = async (platformId: string, query: Record<string, any>) => {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const offset = (page - 1) * limit;

    const conditions = [eq(lineItemRequests.platform_id, platformId)] as any[];

    if (query.status) conditions.push(eq(lineItemRequests.status, String(query.status) as any));
    if (query.purpose_type)
        conditions.push(eq(lineItemRequests.purpose_type, String(query.purpose_type) as any));
    if (query.order_id) conditions.push(eq(lineItemRequests.order_id, String(query.order_id)));
    if (query.inbound_request_id)
        conditions.push(eq(lineItemRequests.inbound_request_id, String(query.inbound_request_id)));
    if (query.service_request_id)
        conditions.push(eq(lineItemRequests.service_request_id, String(query.service_request_id)));

    const rows = await db
        .select()
        .from(lineItemRequests)
        .where(and(...conditions))
        .orderBy(desc(lineItemRequests.created_at))
        .limit(limit)
        .offset(offset);

    return rows.map(formatRequestRow);
};

const createLineItemRequest = async (payload: CreateLineItemRequestPayload) => {
    const purposeType = payload.purpose_type as SupportedPurpose;

    const target = await resolveTarget(
        purposeType,
        {
            order_id: payload.order_id,
            inbound_request_id: payload.inbound_request_id,
            service_request_id: payload.service_request_id,
        },
        payload.platform_id
    );

    const created = await db.transaction(async (tx) => {
        const requestId = await lineItemRequestIdGenerator(payload.platform_id, tx);

        const [inserted] = await tx
            .insert(lineItemRequests)
            .values({
                line_item_request_id: requestId,
                platform_id: payload.platform_id,
                company_id: target.company_id,
                purpose_type: payload.purpose_type,
                order_id: payload.order_id || null,
                inbound_request_id: payload.inbound_request_id || null,
                service_request_id: payload.service_request_id || null,
                status: "REQUESTED",
                description: payload.description,
                category: payload.category,
                quantity: payload.quantity.toString(),
                unit: payload.unit,
                unit_rate: payload.unit_rate.toString(),
                notes: payload.notes || null,
                requested_by: payload.requested_by,
            })
            .returning();

        return inserted;
    });

    const companyName = await getCompanyName(target.company_id);

    await eventBus.emit({
        platform_id: payload.platform_id,
        event_type: EVENT_TYPES.LINE_ITEM_REQUEST_SUBMITTED,
        entity_type: payload.purpose_type,
        entity_id: target.target_id,
        actor_id: payload.requested_by,
        actor_role: "LOGISTICS",
        payload: {
            entity_id_readable: created.line_item_request_id,
            company_id: target.company_id,
            company_name: companyName,
            line_item_request_id: created.line_item_request_id,
            purpose_type: payload.purpose_type,
            target_id: target.target_id,
            description: payload.description,
            category: payload.category,
            quantity: payload.quantity,
            unit: payload.unit,
            unit_rate: payload.unit_rate,
            notes: payload.notes || "",
        },
    });

    return formatRequestRow(created);
};

const approveLineItemRequest = async (
    id: string,
    platformId: string,
    payload: ApproveLineItemRequestPayload,
    adminUser: { id: string }
) => {
    const [request] = await db
        .select()
        .from(lineItemRequests)
        .where(and(eq(lineItemRequests.id, id), eq(lineItemRequests.platform_id, platformId)))
        .limit(1);

    if (!request) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Line item request not found");
    }
    if (request.status !== "REQUESTED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Only REQUESTED line item requests can be approved. Current status: ${request.status}`
        );
    }

    const finalDescription = payload.description?.trim() || request.description;
    const finalCategory = payload.category || request.category;
    const finalQuantity = payload.quantity ?? asNumber(request.quantity);
    const finalUnit = payload.unit?.trim() || request.unit;
    const finalUnitRate = payload.unit_rate ?? asNumber(request.unit_rate);
    const finalNotes = payload.notes !== undefined ? payload.notes : request.notes || undefined;
    const finalBillingMode = payload.billing_mode || "BILLABLE";

    if (finalQuantity <= 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Quantity must be greater than 0");
    }
    if (finalUnitRate < 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Unit rate must be 0 or greater");
    }

    const purposeType = request.purpose_type as SupportedPurpose;

    await resolveTarget(
        purposeType,
        {
            order_id: request.order_id,
            inbound_request_id: request.inbound_request_id,
            service_request_id: request.service_request_id,
        },
        platformId
    );

    const finalRateString = finalUnitRate.toFixed(2);

    const [exactServiceType] = await db
        .select()
        .from(serviceTypes)
        .where(
            and(
                eq(serviceTypes.platform_id, platformId),
                eq(serviceTypes.is_active, true),
                eq(serviceTypes.name, finalDescription),
                eq(serviceTypes.category, finalCategory as any),
                eq(serviceTypes.unit, finalUnit),
                eq(serviceTypes.default_rate, finalRateString)
            )
        )
        .limit(1);

    let resolvedServiceType = exactServiceType;
    let createdServiceTypeId: string | null = null;

    if (!resolvedServiceType) {
        const [sameName] = await db
            .select({ id: serviceTypes.id })
            .from(serviceTypes)
            .where(
                and(
                    eq(serviceTypes.platform_id, platformId),
                    eq(serviceTypes.is_active, true),
                    eq(serviceTypes.name, finalDescription)
                )
            )
            .limit(1);

        if (sameName) {
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A service type with this name already exists with different details. Rename or adjust details before approval."
            );
        }

        const [createdServiceType] = await db
            .insert(serviceTypes)
            .values({
                platform_id: platformId,
                name: finalDescription,
                category: finalCategory as any,
                unit: finalUnit,
                default_rate: finalRateString,
                default_metadata: {},
                description: finalNotes || null,
                display_order: 0,
                is_active: true,
            })
            .returning();

        resolvedServiceType = createdServiceType;
        createdServiceTypeId = createdServiceType.id;
    }

    const lineItem = await LineItemsServices.createCatalogLineItem({
        platform_id: platformId,
        order_id: request.order_id || undefined,
        inbound_request_id: request.inbound_request_id || undefined,
        service_request_id: request.service_request_id || undefined,
        purpose_type: request.purpose_type,
        service_type_id: resolvedServiceType.id,
        quantity: finalQuantity,
        notes: finalNotes,
        billing_mode: finalBillingMode,
        metadata: {},
        client_price_visible: false,
        added_by: adminUser.id,
        added_by_role: "ADMIN",
    });

    const [updated] = await db
        .update(lineItemRequests)
        .set({
            status: "APPROVED",
            reviewed_description: finalDescription,
            reviewed_category: finalCategory as any,
            reviewed_quantity: finalQuantity.toString(),
            reviewed_unit: finalUnit,
            reviewed_unit_rate: finalUnitRate.toFixed(2),
            reviewed_notes: finalNotes || null,
            approved_billing_mode: finalBillingMode,
            admin_note: payload.admin_note || null,
            resolved_by: adminUser.id,
            resolved_at: new Date(),
            approved_line_item_id: lineItem.id,
            created_service_type_id: createdServiceTypeId,
            updated_at: new Date(),
        })
        .where(eq(lineItemRequests.id, id))
        .returning();

    return {
        request: formatRequestRow(updated),
        line_item: lineItem,
        service_type: resolvedServiceType,
        reused_service_type: !createdServiceTypeId,
    };
};

const rejectLineItemRequest = async (
    id: string,
    platformId: string,
    payload: RejectLineItemRequestPayload,
    adminUser: { id: string }
) => {
    const [existing] = await db
        .select()
        .from(lineItemRequests)
        .where(and(eq(lineItemRequests.id, id), eq(lineItemRequests.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Line item request not found");
    }
    if (existing.status !== "REQUESTED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Only REQUESTED line item requests can be rejected. Current status: ${existing.status}`
        );
    }

    const [updated] = await db
        .update(lineItemRequests)
        .set({
            status: "REJECTED",
            admin_note: payload.admin_note,
            resolved_by: adminUser.id,
            resolved_at: new Date(),
            updated_at: new Date(),
        })
        .where(eq(lineItemRequests.id, id))
        .returning();

    return formatRequestRow(updated);
};

export const LineItemRequestsServices = {
    listLineItemRequests,
    createLineItemRequest,
    approveLineItemRequest,
    rejectLineItemRequest,
};
