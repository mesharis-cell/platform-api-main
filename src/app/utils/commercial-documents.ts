import { and, asc, eq, gte, lte } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import { orders, serviceRequests, inboundRequests } from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { roundCurrency } from "./pricing-engine";
import { PricingService } from "../services/pricing.service";

export type CommercialDocumentContextType = "ORDER" | "SERVICE_REQUEST" | "INBOUND_REQUEST";
export type CommercialDocumentAudience = "SELL_SIDE" | "BUY_SIDE";

type NormalizedCompany = {
    id: string;
    name: string;
    contact_email: string;
    contact_phone: string;
};

type NormalizedContact = {
    name: string;
    email: string;
    phone: string;
};

type NormalizedVenue = {
    name: string;
    country: string;
    city: string;
    address: string;
};

type NormalizedDocumentItem = {
    asset_name: string;
    quantity: number;
    handling_tags: string[];
    from_collection_name?: string;
};

type NormalizedDocumentLineItem = {
    line_item_id: string;
    description: string;
    quantity: number;
    category?: string;
    billing_mode?: string;
    client_price_visible: boolean;
    buy_total: number;
    sell_total: number;
    buy_unit_rate: number;
    sell_unit_rate: number;
};

type NormalizedPricing = {
    margin_percent: number;
    buy: {
        base_ops_total: number;
        catalog_total: number;
        custom_total: number;
        service_fee: number;
        final_total: number;
    };
    sell: {
        base_ops_total: number;
        catalog_total: number;
        custom_total: number;
        service_fee: number;
        margin_amount: number;
        final_total: number;
    };
};

export type NormalizedCommercialDocumentContext = {
    context_type: CommercialDocumentContextType;
    context_id: string;
    reference_id: string;
    platform_id: string;
    created_by: string;
    company: NormalizedCompany;
    contact: NormalizedContact;
    timeline: {
        start: Date;
        end: Date;
    };
    venue: NormalizedVenue;
    operational_status: string;
    commercial_status: string;
    billing_mode: "INTERNAL_ONLY" | "CLIENT_BILLABLE" | null;
    items: NormalizedDocumentItem[];
    line_items: NormalizedDocumentLineItem[];
    pricing: NormalizedPricing;
};

export type CommercialDocumentPdfPayload = {
    id: string;
    created_by: string;
    order_id: string;
    platform_id: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    company_name: string;
    event_start_date: Date;
    event_end_date: Date;
    venue_name: string;
    venue_country: string;
    venue_city: string;
    venue_address: string;
    order_status: string;
    financial_status: string;
    items: Array<{
        asset_name: string;
        quantity: number;
        handling_tags: string[];
        from_collection_name?: string;
    }>;
    pricing: {
        service_fee: string;
        logistics_base_price: string;
        final_total_price: string;
        show_breakdown: boolean;
    };
    line_items: Array<{
        line_item_id: string;
        description: string;
        quantity: number;
        unit_rate: number | null;
        total: number | null;
        client_price_visible: boolean;
    }>;
    line_items_sub_total: number;
};

const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const toDateOrNow = (value: Date | string | null | undefined) => {
    if (!value) return new Date();
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const companySlug = (companyName: string) =>
    companyName.trim().replace(/\s+/g, "-").toLowerCase() || "unknown-company";

const toAdminProjection = (pricingRecord: unknown) =>
    (PricingService.projectByRole(pricingRecord as any, "ADMIN") || null) as any;

const mapLineItems = (projected: any): NormalizedDocumentLineItem[] => {
    const lines = Array.isArray(projected?.breakdown_lines) ? projected.breakdown_lines : [];
    return lines
        .filter(
            (line: any) =>
                !line?.is_voided && String(line?.billing_mode || "BILLABLE") === "BILLABLE"
        )
        .map((line: any) => ({
            line_item_id: String(line?.line_id || ""),
            description: String(line?.label || ""),
            quantity: toNumber(line?.quantity),
            category: line?.category ? String(line.category) : undefined,
            billing_mode: line?.billing_mode ? String(line.billing_mode) : undefined,
            client_price_visible: Boolean(line?.client_price_visible),
            buy_total: toNumber(line?.buy_total),
            sell_total: toNumber(line?.sell_total),
            buy_unit_rate: toNumber(line?.buy_unit_price),
            sell_unit_rate: toNumber(line?.sell_unit_price),
        }));
};

const mapPricing = (projected: any): NormalizedPricing => {
    const totals = projected?.totals || {};
    const margin = projected?.margin || {};
    const buyCatalog = toNumber(projected?.line_items?.catalog_total ?? totals.buy_rate_card_total);
    const buyCustom = toNumber(projected?.line_items?.custom_total ?? totals.buy_custom_total);
    const buyBaseOps = toNumber(projected?.base_ops_total ?? totals.buy_base_ops_total);
    const buyFinal = toNumber(totals.buy_total);

    return {
        margin_percent: toNumber(margin.percent ?? projected?.margin_policy?.percent),
        buy: {
            base_ops_total: buyBaseOps,
            catalog_total: buyCatalog,
            custom_total: buyCustom,
            service_fee: roundCurrency(buyCatalog + buyCustom),
            final_total: buyFinal,
        },
        sell: {
            base_ops_total: toNumber(projected?.sell?.base_ops_total ?? totals.sell_base_ops_total),
            catalog_total: toNumber(totals.sell_rate_card_total),
            custom_total: toNumber(totals.sell_custom_total),
            service_fee: toNumber(projected?.sell?.service_fee),
            margin_amount: toNumber(margin.amount),
            final_total: toNumber(projected?.final_total ?? totals.sell_total),
        },
    };
};

const getOrderCommercialContext = async (
    orderId: string,
    platformId: string
): Promise<NormalizedCommercialDocumentContext> => {
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            order_pricing: true,
            venue_city: true,
            items: true,
            line_items: true,
        },
    });

    if (!order) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    if (!order.company)
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found for this order");
    if (!order.order_pricing)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order pricing is missing");

    const venueLocation = (order.venue_location as any) || {};
    const projectedPricing = toAdminProjection(order.order_pricing);
    if (!projectedPricing)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order pricing projection is missing");
    const pricing = mapPricing(projectedPricing);
    const lineItems = mapLineItems(projectedPricing);

    return {
        context_type: "ORDER",
        context_id: order.id,
        reference_id: order.order_id,
        platform_id: order.platform_id,
        created_by: order.created_by,
        company: {
            id: order.company.id,
            name: order.company.name || "Unknown Company",
            contact_email: order.company.contact_email || order.contact_email || "N/A",
            contact_phone: order.company.contact_phone || order.contact_phone || "N/A",
        },
        contact: {
            name: order.contact_name || order.company.name || "N/A",
            email: order.contact_email || order.company.contact_email || "N/A",
            phone: order.contact_phone || order.company.contact_phone || "N/A",
        },
        timeline: {
            start: toDateOrNow(order.event_start_date),
            end: toDateOrNow(order.event_end_date),
        },
        venue: {
            name: order.venue_name || "N/A",
            country: venueLocation.country || "N/A",
            city: order.venue_city?.name || "N/A",
            address: venueLocation.address || "N/A",
        },
        operational_status: order.order_status,
        commercial_status: order.financial_status,
        billing_mode: null,
        pricing,
        items: order.items.map((item) => ({
            asset_name: item.asset_name,
            quantity: toNumber(item.quantity),
            handling_tags: Array.isArray(item.handling_tags) ? (item.handling_tags as any) : [],
            from_collection_name: item.from_collection_name || undefined,
        })),
        line_items: lineItems,
    };
};

const getServiceRequestCommercialContext = async (
    serviceRequestId: string,
    platformId: string
): Promise<NormalizedCommercialDocumentContext> => {
    const serviceRequest = await db.query.serviceRequests.findFirst({
        where: and(
            eq(serviceRequests.id, serviceRequestId),
            eq(serviceRequests.platform_id, platformId)
        ),
        with: {
            company: true,
            request_pricing: true,
            items: true,
            line_items: true,
        },
    });

    if (!serviceRequest)
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
    if (!serviceRequest.company)
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Company not found for this service request"
        );
    if (!serviceRequest.request_pricing)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Service request pricing is missing");

    const projectedPricing = toAdminProjection(serviceRequest.request_pricing);
    if (!projectedPricing)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Service request pricing projection is missing"
        );
    const pricing = mapPricing(projectedPricing);
    const lineItems = mapLineItems(projectedPricing);

    return {
        context_type: "SERVICE_REQUEST",
        context_id: serviceRequest.id,
        reference_id: serviceRequest.service_request_id,
        platform_id: serviceRequest.platform_id,
        created_by: serviceRequest.created_by,
        company: {
            id: serviceRequest.company.id,
            name: serviceRequest.company.name || "Unknown Company",
            contact_email: serviceRequest.company.contact_email || "N/A",
            contact_phone: serviceRequest.company.contact_phone || "N/A",
        },
        contact: {
            name: serviceRequest.company.name || "Service Request",
            email: serviceRequest.company.contact_email || "N/A",
            phone: serviceRequest.company.contact_phone || "N/A",
        },
        timeline: {
            start: toDateOrNow(serviceRequest.requested_start_at || serviceRequest.created_at),
            end: toDateOrNow(
                serviceRequest.requested_due_at ||
                    serviceRequest.requested_start_at ||
                    serviceRequest.created_at
            ),
        },
        venue: {
            name: "Service Request",
            country: "N/A",
            city: "N/A",
            address: "N/A",
        },
        operational_status: serviceRequest.request_status,
        commercial_status: serviceRequest.commercial_status,
        billing_mode: serviceRequest.billing_mode,
        pricing,
        items: serviceRequest.items.map((item) => ({
            asset_name: item.asset_name,
            quantity: toNumber(item.quantity),
            handling_tags: [],
            from_collection_name: "SERVICE_REQUEST",
        })),
        line_items: lineItems,
    };
};

const getInboundRequestCommercialContext = async (
    requestId: string,
    platformId: string
): Promise<NormalizedCommercialDocumentContext> => {
    const request = await db.query.inboundRequests.findFirst({
        where: and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)),
        with: {
            company: true,
            request_pricing: true,
            items: true,
            line_items: true,
            created_by_user: true,
        },
    });

    if (!request) throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    if (!request.company)
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Company not found for this inbound request"
        );
    if (!request.request_pricing)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Inbound request pricing is missing");

    const projectedPricing = toAdminProjection(request.request_pricing);
    if (!projectedPricing)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Inbound request pricing projection is missing"
        );
    const pricing = mapPricing(projectedPricing);
    const lineItems = mapLineItems(projectedPricing);

    return {
        context_type: "INBOUND_REQUEST",
        context_id: request.id,
        reference_id: request.inbound_request_id,
        platform_id: request.platform_id,
        created_by: request.created_by,
        company: {
            id: request.company.id,
            name: request.company.name || "Unknown Company",
            contact_email: request.company.contact_email || "N/A",
            contact_phone: request.company.contact_phone || "N/A",
        },
        contact: {
            name: request.created_by_user?.name || request.company.name || "N/A",
            email: request.created_by_user?.email || request.company.contact_email || "N/A",
            phone: request.company.contact_phone || "N/A",
        },
        timeline: {
            start: toDateOrNow(request.incoming_at),
            end: toDateOrNow(request.incoming_at),
        },
        venue: {
            name: "Inbound Request",
            country: "N/A",
            city: "N/A",
            address: "N/A",
        },
        operational_status: request.request_status,
        commercial_status: request.financial_status,
        billing_mode: null,
        pricing,
        items: request.items.map((item) => ({
            asset_name: item.name,
            quantity: toNumber(item.quantity),
            handling_tags: [],
            from_collection_name: "INBOUND_REQUEST",
        })),
        line_items: lineItems,
    };
};

export type CommercialContextListFilters = {
    company_id?: string;
    date_from?: Date | null;
    date_to?: Date | null;
};

export const listOrderCommercialContexts = async (
    platformId: string,
    filters: CommercialContextListFilters = {}
): Promise<NormalizedCommercialDocumentContext[]> => {
    const conditions = [eq(orders.platform_id, platformId)];
    if (filters.company_id) conditions.push(eq(orders.company_id, filters.company_id));
    if (filters.date_from) conditions.push(gte(orders.created_at, filters.date_from));
    if (filters.date_to) conditions.push(lte(orders.created_at, filters.date_to));

    const rows = await db.query.orders.findMany({
        where: and(...conditions),
        with: {
            company: true,
            order_pricing: true,
            venue_city: true,
            items: true,
            line_items: true,
        },
        orderBy: [asc(orders.created_at)],
    });

    return rows
        .filter((o) => o.company && o.order_pricing)
        .map((order) => {
            const venueLocation = (order.venue_location as any) || {};
            const projectedPricing = toAdminProjection(order.order_pricing!);
            if (!projectedPricing)
                throw new CustomizedError(httpStatus.BAD_REQUEST, "Order pricing missing");
            const pricing = mapPricing(projectedPricing);
            const lineItems = mapLineItems(projectedPricing);
            return {
                context_type: "ORDER" as const,
                context_id: order.id,
                reference_id: order.order_id,
                platform_id: order.platform_id,
                created_by: order.created_by,
                company: {
                    id: order.company!.id,
                    name: order.company!.name || "Unknown Company",
                    contact_email: order.company!.contact_email || order.contact_email || "N/A",
                    contact_phone: order.company!.contact_phone || order.contact_phone || "N/A",
                },
                contact: {
                    name: order.contact_name || order.company!.name || "N/A",
                    email: order.contact_email || order.company!.contact_email || "N/A",
                    phone: order.contact_phone || order.company!.contact_phone || "N/A",
                },
                timeline: {
                    start: toDateOrNow(order.event_start_date),
                    end: toDateOrNow(order.event_end_date),
                },
                venue: {
                    name: order.venue_name || "N/A",
                    country: venueLocation.country || "N/A",
                    city: order.venue_city?.name || "N/A",
                    address: venueLocation.address || "N/A",
                },
                operational_status: order.order_status,
                commercial_status: order.financial_status,
                billing_mode: null as "INTERNAL_ONLY" | "CLIENT_BILLABLE" | null,
                pricing,
                items: order.items.map((item) => ({
                    asset_name: item.asset_name,
                    quantity: toNumber(item.quantity),
                    handling_tags: Array.isArray(item.handling_tags)
                        ? (item.handling_tags as any)
                        : [],
                    from_collection_name: item.from_collection_name || undefined,
                })),
                line_items: lineItems,
            };
        });
};

export const listServiceRequestCommercialContexts = async (
    platformId: string,
    filters: CommercialContextListFilters = {}
): Promise<NormalizedCommercialDocumentContext[]> => {
    const conditions = [eq(serviceRequests.platform_id, platformId)];
    if (filters.company_id) conditions.push(eq(serviceRequests.company_id, filters.company_id));
    if (filters.date_from) conditions.push(gte(serviceRequests.created_at, filters.date_from));
    if (filters.date_to) conditions.push(lte(serviceRequests.created_at, filters.date_to));

    const rows = await db.query.serviceRequests.findMany({
        where: and(...conditions),
        with: { company: true, request_pricing: true, items: true, line_items: true },
        orderBy: [asc(serviceRequests.created_at)],
    });

    return rows
        .filter((sr) => sr.company && sr.request_pricing)
        .map((sr) => {
            const projectedPricing = toAdminProjection(sr.request_pricing!);
            if (!projectedPricing)
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "Service request pricing missing"
                );
            const pricing = mapPricing(projectedPricing);
            const lineItems = mapLineItems(projectedPricing);
            return {
                context_type: "SERVICE_REQUEST" as const,
                context_id: sr.id,
                reference_id: sr.service_request_id,
                platform_id: sr.platform_id,
                created_by: sr.created_by,
                company: {
                    id: sr.company!.id,
                    name: sr.company!.name || "Unknown Company",
                    contact_email: sr.company!.contact_email || "N/A",
                    contact_phone: sr.company!.contact_phone || "N/A",
                },
                contact: {
                    name: sr.company!.name || "Service Request",
                    email: sr.company!.contact_email || "N/A",
                    phone: sr.company!.contact_phone || "N/A",
                },
                timeline: {
                    start: toDateOrNow(sr.requested_start_at || sr.created_at),
                    end: toDateOrNow(sr.requested_due_at || sr.requested_start_at || sr.created_at),
                },
                venue: {
                    name: "Service Request",
                    country: "N/A",
                    city: "N/A",
                    address: "N/A",
                },
                operational_status: sr.request_status,
                commercial_status: sr.commercial_status,
                billing_mode: sr.billing_mode,
                pricing,
                items: sr.items.map((item) => ({
                    asset_name: item.asset_name,
                    quantity: toNumber(item.quantity),
                    handling_tags: [] as string[],
                    from_collection_name: "SERVICE_REQUEST",
                })),
                line_items: lineItems,
            };
        });
};

export const listAllCommercialContexts = async (
    platformId: string,
    filters: CommercialContextListFilters = {}
): Promise<NormalizedCommercialDocumentContext[]> => {
    const [orderContexts, srContexts] = await Promise.all([
        listOrderCommercialContexts(platformId, filters),
        listServiceRequestCommercialContexts(platformId, filters),
    ]);
    return [...orderContexts, ...srContexts].sort(
        (a, b) => a.timeline.start.getTime() - b.timeline.start.getTime()
    );
};

export const getCommercialDocumentContext = async (
    contextType: CommercialDocumentContextType,
    contextId: string,
    platformId: string
) => {
    if (contextType === "ORDER") return getOrderCommercialContext(contextId, platformId);
    if (contextType === "INBOUND_REQUEST")
        return getInboundRequestCommercialContext(contextId, platformId);
    return getServiceRequestCommercialContext(contextId, platformId);
};

export const buildCommercialDocumentPdfPayload = (
    context: NormalizedCommercialDocumentContext,
    audience: CommercialDocumentAudience,
    generatedByUserId?: string,
    options?: { respectClientLineVisibility?: boolean }
): CommercialDocumentPdfPayload => {
    const sellSide = audience === "SELL_SIDE";
    const respectClientLineVisibility = sellSide && options?.respectClientLineVisibility === true;
    const sourceLineTotalsById = new Map(
        context.line_items.map((lineItem) => [
            lineItem.line_item_id,
            sellSide ? lineItem.sell_total : lineItem.buy_total,
        ])
    );
    const lineItems = context.line_items.map((lineItem) => ({
        line_item_id: lineItem.line_item_id,
        description: lineItem.description,
        quantity: lineItem.quantity,
        unit_rate:
            respectClientLineVisibility && !lineItem.client_price_visible
                ? null
                : sellSide
                  ? lineItem.sell_unit_rate
                  : lineItem.buy_unit_rate,
        total:
            respectClientLineVisibility && !lineItem.client_price_visible
                ? null
                : sellSide
                  ? lineItem.sell_total
                  : lineItem.buy_total,
        client_price_visible: lineItem.client_price_visible,
    }));
    const lineItemsSubTotal = lineItems.reduce(
        (sum, lineItem) => sum + toNumber(sourceLineTotalsById.get(lineItem.line_item_id)),
        0
    );
    const serviceFee = sellSide
        ? context.pricing.sell.service_fee
        : context.pricing.buy.service_fee;

    return {
        id: context.context_id,
        created_by: generatedByUserId || context.created_by,
        order_id: context.reference_id,
        platform_id: context.platform_id,
        contact_name: context.contact.name,
        contact_email: context.contact.email,
        contact_phone: context.contact.phone,
        company_name: context.company.name,
        event_start_date: context.timeline.start,
        event_end_date: context.timeline.end,
        venue_name: context.venue.name,
        venue_country: context.venue.country,
        venue_city: context.venue.city,
        venue_address: context.venue.address,
        order_status: context.operational_status,
        financial_status: context.commercial_status,
        items: context.items.map((item) => ({
            asset_name: item.asset_name,
            quantity: item.quantity,
            handling_tags: item.handling_tags,
            from_collection_name: item.from_collection_name,
        })),
        pricing: {
            logistics_base_price: (sellSide
                ? context.pricing.sell.base_ops_total
                : context.pricing.buy.base_ops_total
            ).toFixed(2),
            service_fee: serviceFee.toFixed(2),
            final_total_price: (sellSide
                ? context.pricing.sell.final_total
                : context.pricing.buy.final_total
            ).toFixed(2),
            show_breakdown: true,
        },
        line_items: lineItems,
        line_items_sub_total: roundCurrency(lineItemsSubTotal),
    };
};

export const buildInvoiceS3Key = (
    context: NormalizedCommercialDocumentContext,
    invoiceNumber: string
) => {
    const slug = companySlug(context.company.name);
    if (context.context_type === "ORDER") return `invoices/${slug}/${invoiceNumber}.pdf`;
    if (context.context_type === "INBOUND_REQUEST")
        return `invoices/inbound-request/${slug}/${invoiceNumber}.pdf`;
    return `invoices/service-request/${slug}/${invoiceNumber}.pdf`;
};

export const buildCostEstimateS3Key = (context: NormalizedCommercialDocumentContext) => {
    const slug = companySlug(context.company.name);
    if (context.context_type === "ORDER")
        return `cost-estimates/${slug}/${context.reference_id}.pdf`;
    if (context.context_type === "INBOUND_REQUEST")
        return `cost-estimates/inbound-request/${slug}/${context.reference_id}.pdf`;
    return `cost-estimates/service-request/${slug}/${context.reference_id}.pdf`;
};
