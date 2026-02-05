import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, orderLineItems, prices, orders, serviceTypes } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import {
    CreateCatalogLineItemPayload,
    CreateCustomLineItemPayload,
    LineItemsTotals,
    UpdateLineItemPayload,
    VoidLineItemPayload,
} from "./order-line-items.interfaces";
import { lineItemIdGenerator } from "./order-line-items.utils";

// ----------------------------------- LIST ORDER LINE ITEMS -----------------------------------
const listOrderLineItems = async (orderId: string, platformId: string) => {
    const items = await db
        .select()
        .from(orderLineItems)
        .where(
            and(eq(orderLineItems.order_id, orderId), eq(orderLineItems.platform_id, platformId))
        );

    return items.map((item) => ({
        ...item,
        quantity: item.quantity ? parseFloat(item.quantity) : null,
        unit_rate: item.unit_rate ? parseFloat(item.unit_rate) : null,
        total: parseFloat(item.total),
    }));
};

// ----------------------------------- CREATE CATALOG LINE ITEM -----------------------------------
const createCatalogLineItem = async (data: CreateCatalogLineItemPayload) => {
    const { platform_id, order_id, service_type_id, quantity, unit_rate, notes, added_by } = data;

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
    const total = quantity * unit_rate;

    const lineItemId = await lineItemIdGenerator(platform_id);

    const [result] = await db
        .insert(orderLineItems)
        .values({
            platform_id,
            line_item_id: lineItemId,
            order_id,
            purpose_type: "ORDER",
            service_type_id,
            reskin_request_id: null,
            line_item_type: "CATALOG",
            category: serviceType.category,
            description: serviceType.name,
            quantity: quantity.toString(),
            unit: serviceType.unit,
            unit_rate: unit_rate.toString(),
            total: total.toString(),
            added_by,
            notes: notes || null,
        })
        .returning();

    // Update order pricing after adding new line item
    await updateOrderPricingAfterLineItemChange(order_id, platform_id);

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- CREATE CUSTOM LINE ITEM -----------------------------------
const createCustomLineItem = async (data: CreateCustomLineItemPayload) => {
    const {
        platform_id,
        order_id,
        description,
        category,
        total,
        notes,
        reskin_request_id,
        added_by,
    } = data;

    const lineItemId = await lineItemIdGenerator(platform_id);

    const [result] = await db
        .insert(orderLineItems)
        .values({
            platform_id,
            order_id,
            line_item_id: lineItemId,
            purpose_type: "ORDER",
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
    await updateOrderPricingAfterLineItemChange(order_id, platform_id);

    return {
        ...result,
        quantity: null,
        unit_rate: null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- UPDATE LINE ITEM -----------------------------------
const updateLineItem = async (
    id: string,
    orderId: string,
    platformId: string,
    data: UpdateLineItemPayload
) => {
    const [existing] = await db
        .select()
        .from(orderLineItems)
        .where(
            and(
                eq(orderLineItems.id, id),
                eq(orderLineItems.order_id, orderId),
                eq(orderLineItems.platform_id, platformId)
            )
        )
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

    const [result] = await db
        .update(orderLineItems)
        .set(dbData)
        .where(eq(orderLineItems.id, id))
        .returning();

    // Update order pricing after updating line item
    await updateOrderPricingAfterLineItemChange(orderId, platformId);

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- VOID LINE ITEM -----------------------------------
const voidLineItem = async (
    id: string,
    orderId: string,
    platformId: string,
    data: VoidLineItemPayload
) => {
    const { void_reason, voided_by } = data;

    const [existing] = await db
        .select()
        .from(orderLineItems)
        .where(
            and(
                eq(orderLineItems.id, id),
                eq(orderLineItems.order_id, orderId),
                eq(orderLineItems.platform_id, platformId)
            )
        )
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Line item not found");
    }

    if (existing.is_voided) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Line item is already voided");
    }

    const [result] = await db
        .update(orderLineItems)
        .set({
            is_voided: true,
            voided_at: new Date(),
            voided_by,
            void_reason,
        })
        .where(eq(orderLineItems.id, id))
        .returning();

    // Update order pricing after voiding line item
    await updateOrderPricingAfterLineItemChange(orderId, platformId);

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- CALCULATE LINE ITEMS TOTAL -----------------------------------
const calculateLineItemsTotals = async (
    orderId: string,
    platformId: string
): Promise<LineItemsTotals> => {
    const items = await db
        .select()
        .from(orderLineItems)
        .where(
            and(
                eq(orderLineItems.order_id, orderId),
                eq(orderLineItems.platform_id, platformId),
                eq(orderLineItems.is_voided, false) // Exclude voided items
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

// ----------------------------------- UPDATE ORDER PRICING AFTER LINE ITEM CHANGE -----------------------------------
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
    const lineItemsTotals = await calculateLineItemsTotals(orderId, platformId);

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
    const logisticsSubtotal = baseOpsTotal + transportRate + lineItemsTotals.catalog_total;
    const marginAmount = logisticsSubtotal * (marginPercent / 100);
    const finalTotal = logisticsSubtotal + marginAmount + lineItemsTotals.custom_total;

    // Step 4: Update order pricing
    await db
        .update(prices)
        .set({
            logistics_sub_total: logisticsSubtotal.toFixed(2),
            line_items: {
                catalog_total: lineItemsTotals.catalog_total,
                custom_total: lineItemsTotals.custom_total,
            },
            margin: {
                percent: marginPercent,
                amount: parseFloat(marginAmount.toFixed(2)),
                is_override: marginOverride,
                override_reason: marginOverrideReason,
            },
            final_total: finalTotal.toFixed(2),
            calculated_at: new Date(),
        })
        .where(eq(prices.id, orderResult.order_pricing.id));
};

export const OrderLineItemsServices = {
    listOrderLineItems,
    createCatalogLineItem,
    createCustomLineItem,
    updateLineItem,
    voidLineItem,
    calculateLineItemsTotals,
    updateOrderPricingAfterLineItemChange,
};
