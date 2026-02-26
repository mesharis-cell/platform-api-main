import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { orders, companies, prices, inboundRequests, serviceRequests } from "../../db/schema";
import {
    calculatePricingSummary,
    roundCurrency,
    applyMarginPerLine,
} from "../utils/pricing-engine";
import { LineItemsServices } from "../modules/order-line-items/order-line-items.services";
import CustomizedError from "../error/customized-error";
import httpStatus from "http-status";

type PricedEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST";

type BuildInitialPricingParams = {
    platform_id: string;
    warehouse_ops_rate: string;
    base_ops_total: number;
    margin_percent: number;
    calculated_by: string;
};

type RecalculateParams = {
    entity_type: PricedEntityType;
    entity_id: string;
    platform_id: string;
    calculated_by: string;
    base_ops_total_override?: number;
    set_margin_override?: { percent: number; reason: string | null };
    tx?: any;
};

type RecalculateResult = {
    pricing_id: string;
    base_ops_total: number;
    logistics_sub_total: number;
    line_items: { catalog_total: number; custom_total: number };
    margin: {
        percent: number;
        amount: number;
        is_override: boolean;
        override_reason: string | null;
    };
    final_total: number;
    calculated_at: Date;
};

type RawPricingRecord = {
    warehouse_ops_rate?: string | number | null;
    base_ops_total?: string | number | null;
    logistics_sub_total?: string | number | null;
    line_items?: any;
    transport?: any;
    margin?: any;
    final_total?: string | number | null;
    calculated_at?: Date | string | null;
    [key: string]: unknown;
};

type RawLineItem = {
    line_item_id?: string;
    id?: string;
    description?: string | null;
    quantity?: string | number | null;
    total?: string | number | null;
    unit_rate?: string | number | null;
    unitRate?: string | number | null;
    category?: string | null;
    billing_mode?: string | null;
    billingMode?: string | null;
    is_voided?: boolean | null;
    isVoided?: boolean | null;
    [key: string]: unknown;
};

const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

// ─────────────────────────────────────────────────────────────
//  buildInitialPricing — pure function for entity creation
// ─────────────────────────────────────────────────────────────
const buildInitialPricing = (params: BuildInitialPricingParams) => {
    const baseOps = roundCurrency(params.base_ops_total);
    const summary = calculatePricingSummary({
        base_ops_total: baseOps,
        catalog_total: 0,
        custom_total: 0,
        margin_percent: params.margin_percent,
    });

    return {
        platform_id: params.platform_id,
        warehouse_ops_rate: params.warehouse_ops_rate,
        base_ops_total: baseOps.toFixed(2),
        logistics_sub_total: summary.logistics_sub_total.toFixed(2),
        transport: { system_rate: 0, final_rate: 0 },
        line_items: { catalog_total: 0, custom_total: 0 },
        margin: {
            percent: params.margin_percent,
            amount: summary.margin_amount,
            is_override: false,
            override_reason: null,
        },
        final_total: summary.final_total.toFixed(2),
        calculated_at: new Date(),
        calculated_by: params.calculated_by,
    };
};

// ─────────────────────────────────────────────────────────────
//  recalculate — single write path for all pricing updates
// ─────────────────────────────────────────────────────────────
const recalculate = async (params: RecalculateParams): Promise<RecalculateResult> => {
    const executor = params.tx ?? db;
    const { entity_type, entity_id, platform_id, calculated_by } = params;

    let pricingId: string;
    let existingMargin: any;
    let existingBaseOps: number;
    let companyMarginPercent: number;
    let companyOpsRate: string;

    if (entity_type === "ORDER") {
        const [row] = await executor
            .select({
                pricing_id: prices.id,
                margin: prices.margin,
                base_ops_total: prices.base_ops_total,
                company_margin: companies.platform_margin_percent,
                company_ops_rate: companies.warehouse_ops_rate,
            })
            .from(orders)
            .leftJoin(companies, eq(orders.company_id, companies.id))
            .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
            .where(and(eq(orders.id, entity_id), eq(orders.platform_id, platform_id)))
            .limit(1);

        if (!row?.pricing_id)
            throw new CustomizedError(httpStatus.NOT_FOUND, "Order or pricing not found");
        pricingId = row.pricing_id;
        existingMargin = row.margin;
        existingBaseOps = toNum(row.base_ops_total);
        companyMarginPercent = toNum(row.company_margin);
        companyOpsRate = row.company_ops_rate || "0";
    } else if (entity_type === "INBOUND_REQUEST") {
        const [row] = await executor
            .select({
                pricing_id: prices.id,
                margin: prices.margin,
                base_ops_total: prices.base_ops_total,
                company_margin: companies.platform_margin_percent,
                company_ops_rate: companies.warehouse_ops_rate,
            })
            .from(inboundRequests)
            .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
            .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
            .where(
                and(eq(inboundRequests.id, entity_id), eq(inboundRequests.platform_id, platform_id))
            )
            .limit(1);

        if (!row?.pricing_id)
            throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request or pricing not found");
        pricingId = row.pricing_id;
        existingMargin = row.margin;
        existingBaseOps = toNum(row.base_ops_total);
        companyMarginPercent = toNum(row.company_margin);
        companyOpsRate = row.company_ops_rate || "0";
    } else {
        const [row] = await executor
            .select({
                sr_id: serviceRequests.id,
                pricing_id: serviceRequests.request_pricing_id,
                created_by: serviceRequests.created_by,
                company_margin: companies.platform_margin_percent,
                company_ops_rate: companies.warehouse_ops_rate,
            })
            .from(serviceRequests)
            .leftJoin(companies, eq(serviceRequests.company_id, companies.id))
            .where(
                and(eq(serviceRequests.id, entity_id), eq(serviceRequests.platform_id, platform_id))
            )
            .limit(1);

        if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
        companyMarginPercent = toNum(row.company_margin);
        companyOpsRate = row.company_ops_rate || "0";

        if (!row.pricing_id) {
            const defaultMargin = companyMarginPercent;
            const [created] = await executor
                .insert(prices)
                .values({
                    platform_id,
                    warehouse_ops_rate: companyOpsRate,
                    base_ops_total: "0.00",
                    logistics_sub_total: "0.00",
                    transport: { system_rate: 0, final_rate: 0 },
                    line_items: { catalog_total: 0, custom_total: 0 },
                    margin: {
                        percent: defaultMargin,
                        amount: 0,
                        is_override: false,
                        override_reason: null,
                    },
                    final_total: "0.00",
                    calculated_by: row.created_by,
                })
                .returning({
                    id: prices.id,
                    margin: prices.margin,
                    base_ops_total: prices.base_ops_total,
                });

            pricingId = created.id;
            existingMargin = created.margin;
            existingBaseOps = 0;

            await executor
                .update(serviceRequests)
                .set({ request_pricing_id: created.id, updated_at: new Date() })
                .where(eq(serviceRequests.id, entity_id));
        } else {
            const [pricingRow] = await executor
                .select({ margin: prices.margin, base_ops_total: prices.base_ops_total })
                .from(prices)
                .where(eq(prices.id, row.pricing_id))
                .limit(1);

            pricingId = row.pricing_id;
            existingMargin = pricingRow?.margin;
            existingBaseOps = toNum(pricingRow?.base_ops_total);
        }
    }

    const baseOpsTotal =
        params.base_ops_total_override !== undefined
            ? roundCurrency(params.base_ops_total_override)
            : existingBaseOps;

    let marginPercent: number;
    let isOverride: boolean;
    let overrideReason: string | null;

    if (params.set_margin_override) {
        marginPercent = params.set_margin_override.percent;
        isOverride = true;
        overrideReason = params.set_margin_override.reason;
    } else if (existingMargin?.is_override) {
        marginPercent = toNum(existingMargin.percent);
        isOverride = true;
        overrideReason = existingMargin.override_reason || null;
    } else {
        marginPercent = companyMarginPercent;
        isOverride = false;
        overrideReason = null;
    }

    let lineItemsTotals: { catalog_total: number; custom_total: number };
    if (entity_type === "ORDER") {
        lineItemsTotals = await LineItemsServices.calculateOrderLineItemsTotals(
            entity_id,
            platform_id
        );
    } else if (entity_type === "INBOUND_REQUEST") {
        lineItemsTotals = await LineItemsServices.calculateInboundRequestLineItemsTotals(
            entity_id,
            platform_id
        );
    } else {
        lineItemsTotals = await LineItemsServices.calculateServiceRequestLineItemsTotals(
            entity_id,
            platform_id
        );
    }

    const summary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        catalog_total: lineItemsTotals.catalog_total,
        custom_total: lineItemsTotals.custom_total,
        margin_percent: marginPercent,
    });

    const now = new Date();
    await executor
        .update(prices)
        .set({
            warehouse_ops_rate: companyOpsRate,
            base_ops_total: roundCurrency(baseOpsTotal).toFixed(2),
            logistics_sub_total: summary.logistics_sub_total.toFixed(2),
            transport: { system_rate: 0, final_rate: 0 },
            line_items: {
                catalog_total: roundCurrency(lineItemsTotals.catalog_total),
                custom_total: roundCurrency(lineItemsTotals.custom_total),
            },
            margin: {
                percent: marginPercent,
                amount: summary.margin_amount,
                is_override: isOverride,
                override_reason: overrideReason,
            },
            final_total: summary.final_total.toFixed(2),
            calculated_at: now,
            calculated_by,
        })
        .where(eq(prices.id, pricingId));

    return {
        pricing_id: pricingId,
        base_ops_total: roundCurrency(baseOpsTotal),
        logistics_sub_total: summary.logistics_sub_total,
        line_items: {
            catalog_total: roundCurrency(lineItemsTotals.catalog_total),
            custom_total: roundCurrency(lineItemsTotals.custom_total),
        },
        margin: {
            percent: marginPercent,
            amount: summary.margin_amount,
            is_override: isOverride,
            override_reason: overrideReason,
        },
        final_total: summary.final_total,
        calculated_at: now,
    };
};

// ─────────────────────────────────────────────────────────────
//  projectForRole — pure pricing projection
// ─────────────────────────────────────────────────────────────
const projectForRole = (pricing: RawPricingRecord | null | undefined, role: string) => {
    if (!pricing) return null;

    const baseOpsTotal = toNum(pricing.base_ops_total);
    const catalogTotal = toNum(pricing.line_items?.catalog_total);
    const customTotal = toNum(pricing.line_items?.custom_total);
    const marginPercent = toNum(pricing.margin?.percent);

    const summary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        catalog_total: catalogTotal,
        custom_total: customTotal,
        margin_percent: marginPercent,
    });

    if (role === "CLIENT") {
        return {
            logistics_sub_total: summary.sell_lines.base_ops_total.toFixed(2),
            service_fee: summary.service_fee.toFixed(2),
            final_total: summary.final_total.toFixed(2),
        };
    }

    if (role === "LOGISTICS") {
        return {
            base_ops_total: roundCurrency(baseOpsTotal),
            logistics_sub_total: roundCurrency(baseOpsTotal),
            line_items: {
                catalog_total: roundCurrency(catalogTotal),
                custom_total: roundCurrency(customTotal),
            },
            transport: pricing.transport || { system_rate: 0, final_rate: 0 },
            final_total: summary.final_total.toFixed(2),
            calculated_at: pricing.calculated_at,
        };
    }

    return {
        warehouse_ops_rate: toNum(pricing.warehouse_ops_rate),
        base_ops_total: roundCurrency(baseOpsTotal),
        logistics_sub_total: roundCurrency(baseOpsTotal),
        line_items: {
            catalog_total: roundCurrency(catalogTotal),
            custom_total: roundCurrency(customTotal),
        },
        transport: pricing.transport || { system_rate: 0, final_rate: 0 },
        margin: {
            percent: marginPercent,
            amount: summary.margin_amount,
            is_override: !!pricing.margin?.is_override,
            override_reason: pricing.margin?.override_reason || null,
        },
        final_total: summary.final_total.toFixed(2),
        calculated_at: pricing.calculated_at,
        sell: {
            base_ops_total: summary.sell_lines.base_ops_total,
            service_fee: summary.service_fee,
            final_total: summary.final_total,
        },
    };
};

// ─────────────────────────────────────────────────────────────
//  projectLineItemsForRole — pure line item projection
// ─────────────────────────────────────────────────────────────
const projectLineItemsForRole = (items: RawLineItem[], marginPercent: number, role: string) => {
    const billable = items.filter((item) => {
        const voided = item.is_voided ?? item.isVoided ?? false;
        const billing = item.billing_mode ?? item.billingMode ?? "BILLABLE";
        return !voided && billing === "BILLABLE";
    });

    return billable.map((item) => {
        const qty = toNum(item.quantity);
        const buyTotal = toNum(item.total);
        const buyUnitRate =
            qty > 0 ? roundCurrency(buyTotal / qty) : toNum(item.unit_rate ?? item.unitRate);
        const sellTotal = applyMarginPerLine(buyTotal, marginPercent);
        const sellUnitRate =
            qty > 0
                ? roundCurrency(sellTotal / qty)
                : applyMarginPerLine(buyUnitRate, marginPercent);
        const itemId = item.line_item_id || item.id || "";

        if (role === "CLIENT") {
            return {
                line_item_id: itemId,
                description: item.description || "",
                quantity: qty,
                category: item.category || undefined,
                unit_rate: sellUnitRate,
                total: sellTotal,
            };
        }

        if (role === "LOGISTICS") {
            return {
                line_item_id: itemId,
                description: item.description || "",
                quantity: qty,
                category: item.category || undefined,
                unit_rate: buyUnitRate,
                total: buyTotal,
            };
        }

        return {
            line_item_id: itemId,
            description: item.description || "",
            quantity: qty,
            category: item.category || undefined,
            buy_unit_rate: buyUnitRate,
            buy_total: buyTotal,
            sell_unit_rate: sellUnitRate,
            sell_total: sellTotal,
        };
    });
};

export const PricingService = {
    buildInitialPricing,
    recalculate,
    projectForRole,
    projectLineItemsForRole,
};
