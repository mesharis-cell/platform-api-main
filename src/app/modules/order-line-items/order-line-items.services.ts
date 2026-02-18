import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    lineItems,
    prices,
    orders,
    serviceTypes,
    inboundRequests,
    serviceRequests,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import {
    CreateCatalogLineItemPayload,
    CreateCustomLineItemPayload,
    LineItemsTotals,
    UpdateLineItemPayload,
    VoidLineItemPayload,
} from "./order-line-items.interfaces";
import { lineItemIdGenerator, lineItemQueryValidationConfig } from "./order-line-items.utils";
import queryValidator from "../../utils/query-validator";
import { inboundRequestCostEstimateGenerator } from "../../utils/inbound-request-cost-estimate";
import { serviceRequestCostEstimateGenerator } from "../../utils/service-request-cost-estimate";
import { calculatePricingSummary } from "../../utils/pricing-engine";

const validateTransportMetadata = (metadata: Record<string, unknown> | undefined) => {
    if (!metadata) return;
    if (metadata.truck_plate !== undefined && String(metadata.truck_plate).length > 80) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "truck_plate must be under 80 characters"
        );
    }
    if (metadata.driver_name !== undefined && String(metadata.driver_name).length > 120) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "driver_name must be under 120 characters"
        );
    }
    if (metadata.driver_contact !== undefined && String(metadata.driver_contact).length > 80) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "driver_contact must be under 80 characters"
        );
    }
    if (metadata.truck_size !== undefined && String(metadata.truck_size).length > 80) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "truck_size must be under 80 characters");
    }
    if (metadata.manpower !== undefined) {
        const manpower = Number(metadata.manpower);
        if (!Number.isInteger(manpower) || manpower < 0) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "manpower must be a non-negative integer"
            );
        }
    }
};

// ----------------------------------- GET LINE ITEMS -----------------------------------------
const getLineItems = async (platformId: string, query: Record<string, any>) => {
    const { order_id, inbound_request_id, service_request_id, purpose_type } = query;

    const conditions: any[] = [eq(lineItems.platform_id, platformId)];

    if (order_id) {
        conditions.push(eq(lineItems.order_id, order_id));
    }

    if (inbound_request_id) {
        conditions.push(eq(lineItems.inbound_request_id, inbound_request_id));
    }
    if (service_request_id) {
        conditions.push(eq(lineItems.service_request_id, service_request_id));
    }

    if (purpose_type) {
        queryValidator(lineItemQueryValidationConfig, "purpose_type", purpose_type);
        conditions.push(eq(lineItems.purpose_type, purpose_type));
    }

    const results = await db
        .select()
        .from(lineItems)
        .where(and(...conditions));

    const formattedResults = results.map((item) => ({
        ...item,
        quantity: item.quantity ? parseFloat(item.quantity) : null,
        unit_rate: item.unit_rate ? parseFloat(item.unit_rate) : null,
        total: parseFloat(item.total),
    }));

    return formattedResults;
};

// ----------------------------------- CREATE CATALOG LINE ITEM -------------------------------
const createCatalogLineItem = async (data: CreateCatalogLineItemPayload) => {
    const {
        platform_id,
        order_id,
        inbound_request_id,
        service_request_id,
        purpose_type,
        service_type_id,
        quantity,
        notes,
        billing_mode,
        metadata,
        added_by,
    } = data;

    // Get service type details
    const [serviceType] = await db
        .select()
        .from(serviceTypes)
        .where(and(eq(serviceTypes.id, service_type_id), eq(serviceTypes.platform_id, platform_id)))
        .limit(1);

    if (!serviceType) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service type not found");
    }

    const effectiveMetadata = {
        ...(((serviceType as any).default_metadata || {}) as Record<string, unknown>),
        ...((metadata || {}) as Record<string, unknown>),
    };
    if (serviceType.category === "TRANSPORT") validateTransportMetadata(effectiveMetadata);

    // Calculate total
    const total = quantity * Number(serviceType.default_rate);

    const lineItemId = await lineItemIdGenerator(platform_id);

    const [result] = await db
        .insert(lineItems)
        .values({
            platform_id,
            line_item_id: lineItemId,
            order_id: order_id || null,
            inbound_request_id: inbound_request_id || null,
            service_request_id: service_request_id || null,
            purpose_type,
            service_type_id,
            reskin_request_id: null,
            line_item_type: "CATALOG",
            billing_mode: billing_mode || "BILLABLE",
            category: serviceType.category,
            description: serviceType.name,
            quantity: quantity.toString(),
            unit: serviceType.unit,
            unit_rate: serviceType.default_rate,
            total: total.toString(),
            added_by,
            notes: notes || null,
            metadata: effectiveMetadata,
        })
        .returning();

    // Update order pricing after adding new line item
    if (order_id) {
        await updateOrderPricingAfterLineItemChange(order_id, platform_id);
    }
    if (inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(inbound_request_id, platform_id);
    }
    if (service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(service_request_id, platform_id);
    }

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- CREATE CUSTOM LINE ITEM -------------------------------- //
const createCustomLineItem = async (data: CreateCustomLineItemPayload) => {
    const {
        platform_id,
        order_id,
        inbound_request_id,
        service_request_id,
        purpose_type,
        description,
        category,
        quantity,
        unit,
        unit_rate,
        notes,
        reskin_request_id,
        billing_mode,
        metadata,
        added_by,
    } = data;
    const total = quantity * unit_rate;
    const parsedMetadata = (metadata || {}) as Record<string, unknown>;
    if (category === "TRANSPORT") validateTransportMetadata(parsedMetadata);

    const lineItemId = await lineItemIdGenerator(platform_id);

    const [result] = await db
        .insert(lineItems)
        .values({
            platform_id,
            order_id,
            inbound_request_id: inbound_request_id || null,
            service_request_id: service_request_id || null,
            line_item_id: lineItemId,
            purpose_type,
            service_type_id: null,
            reskin_request_id: reskin_request_id || null,
            line_item_type: "CUSTOM",
            billing_mode: billing_mode || "BILLABLE",
            category: category as any,
            description,
            quantity: quantity.toString(),
            unit,
            unit_rate: unit_rate.toString(),
            total: total.toString(),
            added_by,
            notes: notes || null,
            metadata: parsedMetadata,
        })
        .returning();

    // Update order pricing after adding new line item
    if (order_id) {
        await updateOrderPricingAfterLineItemChange(order_id, platform_id);
    }
    if (inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(inbound_request_id, platform_id);
    }
    if (service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(service_request_id, platform_id);
    }

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- UPDATE LINE ITEM ---------------------------------------
const updateLineItem = async (id: string, platformId: string, data: UpdateLineItemPayload) => {
    const [existing] = await db
        .select()
        .from(lineItems)
        .where(and(eq(lineItems.id, id), eq(lineItems.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Line item not found");
    }

    if (existing.is_voided) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Cannot update voided line item");
    }

    const dbData: any = {
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.billing_mode !== undefined && { billing_mode: data.billing_mode }),
        ...(data.metadata !== undefined && { metadata: data.metadata }),
    };

    if (data.metadata !== undefined && existing.category === "TRANSPORT") {
        validateTransportMetadata((data.metadata || {}) as Record<string, unknown>);
    }

    // For catalog items, recalculate total if quantity or unit_rate changed
    if (existing.line_item_type === "CATALOG") {
        const newQuantity =
            data.quantity !== undefined ? data.quantity : parseFloat(existing.quantity!);
        const newUnitRate =
            data.unit_rate !== undefined ? data.unit_rate : parseFloat(existing.unit_rate!);

        if (data.quantity !== undefined) {
            dbData.quantity = data.quantity.toString();
        }
        if (data.unit !== undefined) {
            dbData.unit = data.unit;
        }
        if (data.unit_rate !== undefined) {
            dbData.unit_rate = data.unit_rate.toString();
        }

        // Recalculate total
        const calculatedTotal = newQuantity * newUnitRate;
        dbData.total = calculatedTotal.toString();
    } else {
        const existingQuantity = existing.quantity ? parseFloat(existing.quantity) : 0;
        const existingUnitRate = existing.unit_rate ? parseFloat(existing.unit_rate) : 0;
        const nextQuantity = data.quantity !== undefined ? data.quantity : existingQuantity;
        const nextUnitRate = data.unit_rate !== undefined ? data.unit_rate : existingUnitRate;

        if (data.quantity !== undefined) dbData.quantity = data.quantity.toString();
        if (data.unit !== undefined) dbData.unit = data.unit;
        if (data.unit_rate !== undefined) dbData.unit_rate = data.unit_rate.toString();

        dbData.total = (nextQuantity * nextUnitRate).toString();
    }

    const [result] = await db.update(lineItems).set(dbData).where(eq(lineItems.id, id)).returning();

    // Update order pricing after adding new line item
    if (result.order_id) {
        await updateOrderPricingAfterLineItemChange(result.order_id, platformId);
    }
    if (result.inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(result.inbound_request_id, platformId);
    }
    if (result.service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(result.service_request_id, platformId);
    }

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- VOID LINE ITEM -----------------------------------------
const voidLineItem = async (id: string, platformId: string, data: VoidLineItemPayload) => {
    const { void_reason, voided_by } = data;

    const [existing] = await db
        .select()
        .from(lineItems)
        .where(and(eq(lineItems.id, id), eq(lineItems.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Line item not found");
    }

    if (existing.is_voided) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Line item is already voided");
    }

    const [result] = await db
        .update(lineItems)
        .set({
            is_voided: true,
            voided_at: new Date(),
            voided_by,
            void_reason,
        })
        .where(eq(lineItems.id, id))
        .returning();

    // Update order pricing after adding new line item
    if (result.order_id) {
        await updateOrderPricingAfterLineItemChange(result.order_id, platformId);
    }
    if (result.inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(result.inbound_request_id, platformId);
    }
    if (result.service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(result.service_request_id, platformId);
    }

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- CALCULATE ORDER LINE ITEMS TOTAL -----------------------
const calculateOrderLineItemsTotals = async (
    orderId: string,
    platformId: string
): Promise<LineItemsTotals> => {
    const items = await db
        .select()
        .from(lineItems)
        .where(
            and(
                eq(lineItems.order_id, orderId),
                eq(lineItems.platform_id, platformId),
                eq(lineItems.is_voided, false), // Exclude voided items
                eq(lineItems.billing_mode, "BILLABLE")
            )
        );

    let catalogTotal = 0;
    let customTotal = 0;

    for (const item of items) {
        const itemTotal = parseFloat(item.total);
        if (item.line_item_type === "CATALOG") {
            catalogTotal += itemTotal;
        } else {
            customTotal += itemTotal;
        }
    }

    return {
        catalog_total: parseFloat(catalogTotal.toFixed(2)),
        custom_total: parseFloat(customTotal.toFixed(2)),
    };
};

// ----------------------------------- CALCULATE INBOUND REQUEST LINE ITEMS TOTAL -------------
const calculateInboundRequestLineItemsTotals = async (
    inboundRequestId: string,
    platformId: string
): Promise<LineItemsTotals> => {
    const items = await db
        .select()
        .from(lineItems)
        .where(
            and(
                eq(lineItems.inbound_request_id, inboundRequestId),
                eq(lineItems.platform_id, platformId),
                eq(lineItems.is_voided, false), // Exclude voided items
                eq(lineItems.billing_mode, "BILLABLE")
            )
        );

    let catalogTotal = 0;
    let customTotal = 0;

    for (const item of items) {
        const itemTotal = parseFloat(item.total);
        if (item.line_item_type === "CATALOG") {
            catalogTotal += itemTotal;
        } else {
            customTotal += itemTotal;
        }
    }

    return {
        catalog_total: parseFloat(catalogTotal.toFixed(2)),
        custom_total: parseFloat(customTotal.toFixed(2)),
    };
};

// ----------------------------------- CALCULATE SERVICE REQUEST LINE ITEMS TOTAL -------------
const calculateServiceRequestLineItemsTotals = async (
    serviceRequestId: string,
    platformId: string
): Promise<LineItemsTotals> => {
    const items = await db
        .select()
        .from(lineItems)
        .where(
            and(
                eq(lineItems.service_request_id, serviceRequestId),
                eq(lineItems.platform_id, platformId),
                eq(lineItems.is_voided, false),
                eq(lineItems.billing_mode, "BILLABLE")
            )
        );

    let catalogTotal = 0;
    let customTotal = 0;
    for (const item of items) {
        const itemTotal = parseFloat(item.total);
        if (item.line_item_type === "CATALOG") {
            catalogTotal += itemTotal;
        } else {
            customTotal += itemTotal;
        }
    }

    return {
        catalog_total: parseFloat(catalogTotal.toFixed(2)),
        custom_total: parseFloat(customTotal.toFixed(2)),
    };
};

// ----------------------------------- UPDATE ORDER PRICING AFTER LINE ITEM CHANGE ------------
const updateOrderPricingAfterLineItemChange = async (
    orderId: string,
    platformId: string
): Promise<void> => {
    // Step 1: Get the order with its pricing
    const [orderResult] = await db
        .select({
            order: orders,
            company: {
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            order_pricing: {
                id: prices.id,
                margin: prices.margin,
                base_ops_total: prices.base_ops_total,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    if (!orderResult || !orderResult.order_pricing || !orderResult.company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order or pricing not found");
    }

    // Step 2: Calculate line items totals
    const lineItemsTotals = await calculateOrderLineItemsTotals(orderId, platformId);

    // Step 3: Calculate new final pricing
    const baseOpsTotal = Number(orderResult.order_pricing.base_ops_total);
    const marginData = orderResult.order_pricing.margin as any;
    const marginOverride = !!marginData?.is_override;
    const marginPercent = marginOverride
        ? parseFloat(marginData.percent)
        : parseFloat(orderResult.company.platform_margin_percent);
    const marginOverrideReason = marginOverride ? marginData.override_reason : null;

    // Calculate totals using the formula from order.services.ts
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        catalog_total: lineItemsTotals.catalog_total,
        custom_total: lineItemsTotals.custom_total,
        margin_percent: marginPercent,
    });

    // Step 4: Update order pricing
    await db
        .update(prices)
        .set({
            logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
            transport: {
                system_rate: 0,
                final_rate: 0,
            },
            line_items: {
                catalog_total: lineItemsTotals.catalog_total,
                custom_total: lineItemsTotals.custom_total,
            },
            margin: {
                percent: marginPercent,
                amount: pricingSummary.margin_amount,
                is_override: marginOverride,
                override_reason: marginOverrideReason,
            },
            final_total: pricingSummary.final_total.toFixed(2),
            calculated_at: new Date(),
        })
        .where(eq(prices.id, orderResult.order_pricing.id));
};

// ----------------------------------- UPDATE INBOUND REQUEST PRICING AFTER LINE ITEM CHANGE --
const updateInboundRequestPricingAfterLineItemChange = async (
    inboundRequestId: string,
    platformId: string
): Promise<void> => {
    // Step 1: Get the inbound request with its pricing
    const [inboundRequest] = await db
        .select({
            inbound_request: inboundRequests,
            company: {
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            pricing: {
                id: prices.id,
                margin: prices.margin,
                base_ops_total: prices.base_ops_total,
            },
        })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(
            and(
                eq(inboundRequests.id, inboundRequestId),
                eq(inboundRequests.platform_id, platformId)
            )
        )
        .limit(1);

    if (!inboundRequest || !inboundRequest.pricing || !inboundRequest.company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request or pricing not found");
    }

    // Step 2: Calculate line items totals
    const lineItemsTotals = await calculateInboundRequestLineItemsTotals(
        inboundRequestId,
        platformId
    );

    // Step 3: Calculate new final pricing
    const baseOpsTotal = Number(inboundRequest.pricing.base_ops_total);
    const marginData = inboundRequest.pricing.margin as any;
    const marginOverride = !!marginData?.is_override;
    const marginPercent = marginOverride
        ? parseFloat(marginData.percent)
        : parseFloat(inboundRequest.company.platform_margin_percent);
    const marginOverrideReason = marginOverride ? marginData.override_reason : null;

    // Calculate totals using the formula from order.services.ts
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        catalog_total: lineItemsTotals.catalog_total,
        custom_total: lineItemsTotals.custom_total,
        margin_percent: marginPercent,
    });

    // Step 4: Update inbound request pricing
    await db
        .update(prices)
        .set({
            logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
            transport: {
                system_rate: 0,
                final_rate: 0,
            },
            line_items: {
                catalog_total: lineItemsTotals.catalog_total,
                custom_total: lineItemsTotals.custom_total,
            },
            margin: {
                percent: marginPercent,
                amount: pricingSummary.margin_amount,
                is_override: marginOverride,
                override_reason: marginOverrideReason,
            },
            final_total: pricingSummary.final_total.toFixed(2),
            calculated_at: new Date(),
        })
        .where(eq(prices.id, inboundRequest.pricing.id));

    // Step 5: Regenerate cost estimate PDF
    await inboundRequestCostEstimateGenerator(inboundRequestId, platformId, true);
};

// ----------------------------------- UPDATE SERVICE REQUEST PRICING AFTER LINE ITEM CHANGE --
const updateServiceRequestPricingAfterLineItemChange = async (
    serviceRequestId: string,
    platformId: string
): Promise<void> => {
    const [serviceRequest] = await db
        .select({
            service_request: serviceRequests,
            company: {
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            pricing: {
                id: prices.id,
                margin: prices.margin,
                base_ops_total: prices.base_ops_total,
            },
        })
        .from(serviceRequests)
        .leftJoin(companies, eq(serviceRequests.company_id, companies.id))
        .leftJoin(prices, eq(serviceRequests.request_pricing_id, prices.id))
        .where(
            and(
                eq(serviceRequests.id, serviceRequestId),
                eq(serviceRequests.platform_id, platformId)
            )
        )
        .limit(1);

    if (!serviceRequest || !serviceRequest.company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service request or company not found");
    }

    let pricingId = serviceRequest.pricing?.id;
    if (!pricingId) {
        const defaultMarginPercent = parseFloat(
            serviceRequest.company.platform_margin_percent || "0"
        );
        const [createdPricing] = await db
            .insert(prices)
            .values({
                platform_id: platformId,
                warehouse_ops_rate: (serviceRequest.company.warehouse_ops_rate || "0").toString(),
                base_ops_total: "0.00",
                logistics_sub_total: "0.00",
                transport: {
                    system_rate: 0,
                    final_rate: 0,
                    is_override: false,
                    override_reason: null,
                },
                line_items: {
                    catalog_total: 0,
                    custom_total: 0,
                },
                margin: {
                    percent: defaultMarginPercent,
                    amount: 0,
                    is_override: false,
                    override_reason: null,
                },
                final_total: "0.00",
                calculated_by: serviceRequest.service_request.created_by,
            })
            .returning({
                id: prices.id,
                margin: prices.margin,
                base_ops_total: prices.base_ops_total,
            });

        pricingId = createdPricing.id;
        serviceRequest.pricing = createdPricing;

        await db
            .update(serviceRequests)
            .set({ request_pricing_id: createdPricing.id, updated_at: new Date() })
            .where(eq(serviceRequests.id, serviceRequestId));
    }

    const lineItemsTotals = await calculateServiceRequestLineItemsTotals(
        serviceRequestId,
        platformId
    );

    const baseOpsTotal = Number(serviceRequest.pricing?.base_ops_total || 0);
    const marginData = (serviceRequest.pricing?.margin || {}) as any;
    const marginOverride = !!marginData?.is_override;
    const marginPercent = marginOverride
        ? parseFloat(marginData.percent)
        : parseFloat(serviceRequest.company.platform_margin_percent || "0");
    const marginOverrideReason = marginOverride ? marginData.override_reason : null;

    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        catalog_total: lineItemsTotals.catalog_total,
        custom_total: lineItemsTotals.custom_total,
        margin_percent: marginPercent,
    });

    await db
        .update(prices)
        .set({
            warehouse_ops_rate: (serviceRequest.company.warehouse_ops_rate || "0").toString(),
            logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
            transport: {
                system_rate: 0,
                final_rate: 0,
            },
            line_items: {
                catalog_total: lineItemsTotals.catalog_total,
                custom_total: lineItemsTotals.custom_total,
            },
            margin: {
                percent: marginPercent,
                amount: pricingSummary.margin_amount,
                is_override: marginOverride,
                override_reason: marginOverrideReason,
            },
            final_total: pricingSummary.final_total.toFixed(2),
            calculated_at: new Date(),
        })
        .where(eq(prices.id, pricingId));

    await serviceRequestCostEstimateGenerator(serviceRequestId, platformId, true);
};

export const LineItemsServices = {
    getLineItems,
    createCatalogLineItem,
    createCustomLineItem,
    updateLineItem,
    voidLineItem,
    calculateOrderLineItemsTotals,
    calculateInboundRequestLineItemsTotals,
    calculateServiceRequestLineItemsTotals,
    updateOrderPricingAfterLineItemChange,
    updateServiceRequestPricingAfterLineItemChange,
};
