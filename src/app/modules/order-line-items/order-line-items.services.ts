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
import { calculatePricingSummary } from "../../utils/pricing-engine";

// ----------------------------------- GET LINE ITEMS -----------------------------------------
const getLineItems = async (platformId: string, query: Record<string, any>) => {
    const { order_id, inbound_request_id, purpose_type } = query;

    const conditions: any[] = [eq(lineItems.platform_id, platformId)];

    if (order_id) {
        conditions.push(eq(lineItems.order_id, order_id));
    }

    if (inbound_request_id) {
        conditions.push(eq(lineItems.inbound_request_id, inbound_request_id));
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
        purpose_type,
        service_type_id,
        quantity,
        notes,
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
            purpose_type,
            service_type_id,
            reskin_request_id: null,
            line_item_type: "CATALOG",
            category: serviceType.category,
            description: serviceType.name,
            quantity: quantity.toString(),
            unit: serviceType.unit,
            unit_rate: serviceType.default_rate,
            total: total.toString(),
            added_by,
            notes: notes || null,
        })
        .returning();

    // Update order pricing after adding new line item
    if (order_id) {
        await updateOrderPricingAfterLineItemChange(order_id, platform_id);
    }
    if (inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(inbound_request_id, platform_id);
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
        purpose_type,
        description,
        category,
        total,
        notes,
        reskin_request_id,
        added_by,
    } = data;

    const lineItemId = await lineItemIdGenerator(platform_id);

    const [result] = await db
        .insert(lineItems)
        .values({
            platform_id,
            order_id,
            inbound_request_id: inbound_request_id || null,
            line_item_id: lineItemId,
            purpose_type,
            service_type_id: null,
            reskin_request_id: reskin_request_id || null,
            line_item_type: "CUSTOM",
            category: category as any,
            description,
            quantity: null,
            unit: null,
            unit_rate: null,
            total: total.toString(),
            added_by,
            notes: notes || null,
        })
        .returning();

    // Update order pricing after adding new line item
    if (order_id) {
        await updateOrderPricingAfterLineItemChange(order_id, platform_id);
    }
    if (inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(inbound_request_id, platform_id);
    }

    return {
        ...result,
        quantity: null,
        unit_rate: null,
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

    const dbData: any = { ...data };

    // For catalog items, recalculate total if quantity or unit_rate changed
    if (existing.line_item_type === "CATALOG") {
        const newQuantity =
            data.quantity !== undefined ? data.quantity : parseFloat(existing.quantity!);
        const newUnitRate =
            data.unit_rate !== undefined ? data.unit_rate : parseFloat(existing.unit_rate!);

        if (data.quantity !== undefined) {
            dbData.quantity = data.quantity.toString();
        }
        if (data.unit_rate !== undefined) {
            dbData.unit_rate = data.unit_rate.toString();
        }

        // Recalculate total
        const calculatedTotal = newQuantity * newUnitRate;
        dbData.total = calculatedTotal.toString();
    } else if (data.total !== undefined) {
        // Custom item, allow total update
        dbData.total = data.total.toString();
    }

    const [result] = await db.update(lineItems).set(dbData).where(eq(lineItems.id, id)).returning();

    // Update order pricing after adding new line item
    if (result.order_id) {
        await updateOrderPricingAfterLineItemChange(result.order_id, platformId);
    }
    if (result.inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(result.inbound_request_id, platformId);
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
                eq(lineItems.is_voided, false) // Exclude voided items
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
                eq(lineItems.is_voided, false) // Exclude voided items
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
                transport: prices.transport,
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
    const transportRate = Number((orderResult.order_pricing.transport as any)?.final_rate || 0);
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
        transport_rate: transportRate,
        catalog_total: lineItemsTotals.catalog_total,
        custom_total: lineItemsTotals.custom_total,
        margin_percent: marginPercent,
    });

    // Step 4: Update order pricing
    await db
        .update(prices)
        .set({
            logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
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
        transport_rate: 0,
        catalog_total: lineItemsTotals.catalog_total,
        custom_total: lineItemsTotals.custom_total,
        margin_percent: marginPercent,
    });

    // Step 4: Update inbound request pricing
    await db
        .update(prices)
        .set({
            logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
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

export const LineItemsServices = {
    getLineItems,
    createCatalogLineItem,
    createCustomLineItem,
    updateLineItem,
    voidLineItem,
    calculateOrderLineItemsTotals,
    calculateInboundRequestLineItemsTotals,
    updateOrderPricingAfterLineItemChange,
};
