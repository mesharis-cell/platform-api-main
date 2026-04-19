import { and, asc, eq, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import {
    companies,
    inboundRequestItems,
    inboundRequests,
    lineItems,
    orders,
    platforms,
    prices,
    selfPickups,
    serviceRequests,
    serviceTypes,
} from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { eventBus } from "../events/event-bus";
import { EVENT_TYPES } from "../events/event-types";
import { applyMarginPerLine, roundCurrency } from "../utils/pricing-engine";
import { lineItemIdGenerator } from "../modules/order-line-items/order-line-items.utils";
import { resolveEffectiveFeature } from "../constants/common";

export type PricedEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "SELF_PICKUP";
type PricingRole = "ADMIN" | "LOGISTICS" | "CLIENT";

type BreakdownLineKind = "BASE_OPS" | "RATE_CARD" | "CUSTOM";
type BreakdownSourceMode =
    | "WAREHOUSE_OPS_RATE"
    | "SERVICE_TYPE"
    | "MANUAL"
    | "LEGACY_MIGRATION"
    | "SYSTEM_LINE_ITEM";

type BreakdownLine = {
    line_id: string;
    line_kind: BreakdownLineKind;
    category: string;
    label: string;
    quantity: number;
    unit: string;
    buy_unit_price: number;
    buy_total: number;
    sell_unit_price: number;
    sell_total: number;
    billing_mode: "BILLABLE" | "NON_BILLABLE" | "COMPLIMENTARY";
    source: {
        mode: BreakdownSourceMode;
        service_type_id: string | null;
        service_type_name_snapshot: string | null;
        service_type_rate_snapshot: number | null;
    };
    is_voided: boolean;
    notes: string | null;
    created_by: string | null;
    created_at: string | null;
    updated_by: string | null;
    updated_at: string | null;
    voided_by: string | null;
    voided_at: string | null;
    void_reason: string | null;
    client_price_visible: boolean;
};

type BuildInitialPricingParams = {
    platform_id: string;
    entity_type: PricedEntityType;
    entity_id: string;
    warehouse_ops_rate: string | number;
    base_ops_total: number;
    margin_percent: number;
    vat_percent?: number;
    calculated_by: string;
    volume?: number;
    enable_base_operations?: boolean;
};

type RebuildBreakdownParams = {
    entity_type: PricedEntityType;
    entity_id: string;
    platform_id: string;
    calculated_by: string;
    base_ops_total_override?: number;
    set_margin_override?: { percent: number; reason: string | null };
    tx?: any;
};

type RawPricingRecord = {
    id?: string;
    platform_id?: string;
    entity_type?: PricedEntityType;
    entity_id?: string;
    margin_percent?: string | number | null;
    vat_percent?: string | number | null;
    margin_is_override?: boolean | null;
    margin_override_reason?: string | null;
    breakdown_lines?: unknown;
    calculated_at?: Date | string | null;
    calculated_by?: string | null;
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
    line_item_type?: string | null;
    lineItemType?: string | null;
    system_key?: string | null;
    client_price_visible?: boolean | null;
    clientPriceVisible?: boolean | null;
    [key: string]: unknown;
};

type BreakdownTotals = {
    buy_base_ops_total: number;
    buy_rate_card_total: number;
    buy_custom_total: number;
    buy_total: number;
    sell_base_ops_total: number;
    sell_rate_card_total: number;
    sell_custom_total: number;
    sell_total: number;
    sell_vat_percent: number;
    sell_vat_amount: number;
    sell_total_with_vat: number;
    margin_amount: number;
};

const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const toIso = (v: Date | string | null | undefined): string | null => {
    if (!v) return null;
    const parsed = new Date(v);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

const toBreakdownLine = (line: unknown): BreakdownLine | null => {
    if (!line || typeof line !== "object") return null;
    const row = line as Record<string, unknown>;
    const lineKind = String(row.line_kind || "");
    if (!["BASE_OPS", "RATE_CARD", "CUSTOM"].includes(lineKind)) return null;

    const sourceRaw =
        row.source && typeof row.source === "object" ? (row.source as Record<string, unknown>) : {};
    return {
        line_id: String(row.line_id || ""),
        line_kind: lineKind as BreakdownLineKind,
        category: String(row.category || "OTHER"),
        label: String(row.label || ""),
        quantity: toNum(row.quantity),
        unit: String(row.unit || "service"),
        buy_unit_price: roundCurrency(toNum(row.buy_unit_price)),
        buy_total: roundCurrency(toNum(row.buy_total)),
        sell_unit_price: roundCurrency(toNum(row.sell_unit_price)),
        sell_total: roundCurrency(toNum(row.sell_total)),
        billing_mode: (String(row.billing_mode || "BILLABLE") as any) || "BILLABLE",
        source: {
            mode: (String(sourceRaw.mode || "MANUAL") as BreakdownSourceMode) || "MANUAL",
            service_type_id:
                sourceRaw.service_type_id !== undefined && sourceRaw.service_type_id !== null
                    ? String(sourceRaw.service_type_id)
                    : null,
            service_type_name_snapshot:
                sourceRaw.service_type_name_snapshot !== undefined &&
                sourceRaw.service_type_name_snapshot !== null
                    ? String(sourceRaw.service_type_name_snapshot)
                    : null,
            service_type_rate_snapshot:
                sourceRaw.service_type_rate_snapshot !== undefined &&
                sourceRaw.service_type_rate_snapshot !== null
                    ? toNum(sourceRaw.service_type_rate_snapshot)
                    : null,
        },
        is_voided: !!row.is_voided,
        notes: row.notes ? String(row.notes) : null,
        created_by: row.created_by ? String(row.created_by) : null,
        created_at: toIso(row.created_at as Date | string | null | undefined),
        updated_by: row.updated_by ? String(row.updated_by) : null,
        updated_at: toIso(row.updated_at as Date | string | null | undefined),
        voided_by: row.voided_by ? String(row.voided_by) : null,
        voided_at: toIso(row.voided_at as Date | string | null | undefined),
        void_reason: row.void_reason ? String(row.void_reason) : null,
        client_price_visible: !!row.client_price_visible,
    };
};

const parseBreakdownLines = (lines: unknown): BreakdownLine[] => {
    if (!Array.isArray(lines)) return [];
    return lines.map(toBreakdownLine).filter((line): line is BreakdownLine => !!line);
};

const shouldCountInTotals = (line: BreakdownLine) =>
    !line.is_voided && line.billing_mode === "BILLABLE";

const shouldHideLineForClient = (line: BreakdownLine) =>
    line.line_kind === "CUSTOM" && line.billing_mode === "NON_BILLABLE";

const calculateBreakdownTotals = (lines: BreakdownLine[], vatPercent = 0): BreakdownTotals => {
    const totals: BreakdownTotals = {
        buy_base_ops_total: 0,
        buy_rate_card_total: 0,
        buy_custom_total: 0,
        buy_total: 0,
        sell_base_ops_total: 0,
        sell_rate_card_total: 0,
        sell_custom_total: 0,
        sell_total: 0,
        sell_vat_percent: 0,
        sell_vat_amount: 0,
        sell_total_with_vat: 0,
        margin_amount: 0,
    };

    for (const line of lines) {
        if (!shouldCountInTotals(line)) continue;
        const buy = toNum(line.buy_total);
        const sell = toNum(line.sell_total);
        if (line.line_kind === "BASE_OPS") {
            totals.buy_base_ops_total += buy;
            totals.sell_base_ops_total += sell;
        } else if (line.line_kind === "RATE_CARD") {
            totals.buy_rate_card_total += buy;
            totals.sell_rate_card_total += sell;
        } else {
            totals.buy_custom_total += buy;
            totals.sell_custom_total += sell;
        }
    }

    totals.buy_base_ops_total = roundCurrency(totals.buy_base_ops_total);
    totals.buy_rate_card_total = roundCurrency(totals.buy_rate_card_total);
    totals.buy_custom_total = roundCurrency(totals.buy_custom_total);
    totals.sell_base_ops_total = roundCurrency(totals.sell_base_ops_total);
    totals.sell_rate_card_total = roundCurrency(totals.sell_rate_card_total);
    totals.sell_custom_total = roundCurrency(totals.sell_custom_total);

    totals.buy_total = roundCurrency(
        totals.buy_base_ops_total + totals.buy_rate_card_total + totals.buy_custom_total
    );
    totals.sell_total = roundCurrency(
        totals.sell_base_ops_total + totals.sell_rate_card_total + totals.sell_custom_total
    );
    totals.sell_vat_percent = roundCurrency(vatPercent);
    totals.sell_vat_amount = roundCurrency((totals.sell_total * totals.sell_vat_percent) / 100);
    totals.sell_total_with_vat = roundCurrency(totals.sell_total + totals.sell_vat_amount);
    totals.margin_amount = roundCurrency(totals.sell_total - totals.buy_total);
    return totals;
};

const getLineItemCondition = (entityType: PricedEntityType, entityId: string) => {
    if (entityType === "ORDER") return eq(lineItems.order_id, entityId);
    if (entityType === "INBOUND_REQUEST") return eq(lineItems.inbound_request_id, entityId);
    if (entityType === "SELF_PICKUP") return eq(lineItems.self_pickup_id, entityId);
    return eq(lineItems.service_request_id, entityId);
};

const loadEntityLineItems = async (
    executor: any,
    entityType: PricedEntityType,
    entityId: string,
    platformId: string
) =>
    executor
        .select({
            id: lineItems.id,
            line_item_id: lineItems.line_item_id,
            line_item_type: lineItems.line_item_type,
            system_key: lineItems.system_key,
            category: lineItems.category,
            description: lineItems.description,
            quantity: lineItems.quantity,
            unit: lineItems.unit,
            unit_rate: lineItems.unit_rate,
            total: lineItems.total,
            billing_mode: lineItems.billing_mode,
            is_voided: lineItems.is_voided,
            notes: lineItems.notes,
            added_by: lineItems.added_by,
            added_at: lineItems.added_at,
            updated_at: lineItems.updated_at,
            voided_by: lineItems.voided_by,
            voided_at: lineItems.voided_at,
            void_reason: lineItems.void_reason,
            service_type_id: lineItems.service_type_id,
            service_type_name: serviceTypes.name,
            service_type_rate: serviceTypes.default_rate,
            client_price_visible: lineItems.client_price_visible,
        })
        .from(lineItems)
        .leftJoin(serviceTypes, eq(lineItems.service_type_id, serviceTypes.id))
        .where(
            and(eq(lineItems.platform_id, platformId), getLineItemCondition(entityType, entityId))
        )
        .orderBy(asc(lineItems.created_at));

const buildBreakdownLinesFromLineItems = (
    rawItems: Array<Record<string, unknown>>,
    marginPercent: number
): BreakdownLine[] =>
    rawItems.map((item) => {
        const quantity = toNum(item.quantity);
        const buyTotal = roundCurrency(toNum(item.total));
        const buyUnitPrice =
            quantity > 0
                ? roundCurrency(buyTotal / quantity)
                : roundCurrency(toNum(item.unit_rate || 0));
        const sellTotal = applyMarginPerLine(buyTotal, marginPercent);
        const sellUnitPrice =
            quantity > 0
                ? roundCurrency(sellTotal / quantity)
                : applyMarginPerLine(buyUnitPrice, marginPercent);
        const nowIso = new Date().toISOString();
        const systemKey = item.system_key ? String(item.system_key) : null;
        const isSystemBaseOps = item.line_item_type === "SYSTEM" && systemKey === "BASE_OPS";
        return {
            line_id: String(item.line_item_id || ""),
            line_kind: isSystemBaseOps
                ? "BASE_OPS"
                : item.line_item_type === "CATALOG"
                  ? "RATE_CARD"
                  : "CUSTOM",
            category: isSystemBaseOps ? "BASE_OPS" : String(item.category || "OTHER"),
            label: isSystemBaseOps
                ? quantity > 0
                    ? `Picking & Handling (${quantity.toFixed(3)} m³)`
                    : "Picking & Handling"
                : String(item.description || ""),
            quantity,
            unit: String(item.unit || "service"),
            buy_unit_price: buyUnitPrice,
            buy_total: buyTotal,
            sell_unit_price: sellUnitPrice,
            sell_total: sellTotal,
            billing_mode: (String(item.billing_mode || "BILLABLE") as any) || "BILLABLE",
            source: {
                mode: isSystemBaseOps
                    ? "SYSTEM_LINE_ITEM"
                    : item.line_item_type === "CATALOG"
                      ? "SERVICE_TYPE"
                      : "MANUAL",
                service_type_id: item.service_type_id ? String(item.service_type_id) : null,
                service_type_name_snapshot: item.service_type_name
                    ? String(item.service_type_name)
                    : item.description
                      ? String(item.description)
                      : null,
                service_type_rate_snapshot:
                    item.service_type_rate !== undefined && item.service_type_rate !== null
                        ? toNum(item.service_type_rate)
                        : item.unit_rate !== undefined && item.unit_rate !== null
                          ? toNum(item.unit_rate)
                          : null,
            },
            is_voided: !!item.is_voided,
            notes: item.notes ? String(item.notes) : null,
            created_by: item.added_by ? String(item.added_by) : null,
            created_at: toIso(item.added_at as Date | string | null | undefined),
            updated_by: item.added_by ? String(item.added_by) : null,
            updated_at: toIso(item.updated_at as Date | string | null | undefined) || nowIso,
            voided_by: item.voided_by ? String(item.voided_by) : null,
            voided_at: toIso(item.voided_at as Date | string | null | undefined),
            void_reason: item.void_reason ? String(item.void_reason) : null,
            client_price_visible: !!item.client_price_visible,
        };
    });

const computeBaseOpsTotal = (volume: number | undefined, warehouseOpsRate: number) =>
    roundCurrency(roundCurrency(volume || 0) * roundCurrency(warehouseOpsRate));

const syncSystemBaseLineItem = async (
    executor: any,
    params: {
        entityType: PricedEntityType;
        entityId: string;
        platformId: string;
        addedBy: string;
        companyOpsRate: number;
        volume?: number;
        enableBaseOperations: boolean;
        baseOpsTotalOverride?: number;
    }
) => {
    if (params.entityType === "SERVICE_REQUEST") return null;

    const baseTotal =
        params.baseOpsTotalOverride !== undefined
            ? roundCurrency(params.baseOpsTotalOverride)
            : computeBaseOpsTotal(params.volume, params.companyOpsRate);
    const condition = getLineItemCondition(params.entityType, params.entityId);

    const [existing] = await executor
        .select()
        .from(lineItems)
        .where(
            and(
                eq(lineItems.platform_id, params.platformId),
                condition,
                eq(lineItems.line_item_type, "SYSTEM"),
                eq(lineItems.system_key, "BASE_OPS")
            )
        )
        .limit(1);

    if (!params.enableBaseOperations || baseTotal <= 0) {
        if (existing && !existing.is_voided) {
            await executor
                .update(lineItems)
                .set({
                    is_voided: true,
                    voided_at: new Date(),
                    voided_by: params.addedBy,
                    void_reason: "Base operations disabled or zero total",
                    updated_at: new Date(),
                })
                .where(eq(lineItems.id, existing.id));
        }
        return null;
    }

    const quantity = roundCurrency(params.volume || 0);
    const unitRate =
        quantity > 0 ? roundCurrency(baseTotal / quantity) : roundCurrency(params.companyOpsRate);

    const values = {
        quantity: quantity.toFixed(2),
        unit: "m3",
        unit_rate: unitRate.toFixed(2),
        total: baseTotal.toFixed(2),
        category: "HANDLING" as const,
        description: "Picking & Handling",
        billing_mode: "BILLABLE" as const,
        notes: null,
        metadata: {
            generated_by: "pricing_service",
            volume_snapshot: quantity,
            warehouse_ops_rate_snapshot: roundCurrency(params.companyOpsRate),
        },
        client_price_visible: existing?.client_price_visible ?? false,
        is_voided: false,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        updated_at: new Date(),
    };

    if (existing) {
        const [updated] = await executor
            .update(lineItems)
            .set(values)
            .where(eq(lineItems.id, existing.id))
            .returning();
        return updated;
    }

    const lineItemId = await lineItemIdGenerator(params.platformId, executor);
    const [inserted] = await executor
        .insert(lineItems)
        .values({
            platform_id: params.platformId,
            line_item_id: lineItemId,
            order_id: params.entityType === "ORDER" ? params.entityId : null,
            inbound_request_id: params.entityType === "INBOUND_REQUEST" ? params.entityId : null,
            service_request_id: null, // SERVICE_REQUEST returns early at top of fn
            self_pickup_id: params.entityType === "SELF_PICKUP" ? params.entityId : null,
            purpose_type: params.entityType,
            service_type_id: null,
            line_item_type: "SYSTEM",
            system_key: "BASE_OPS",
            added_by: params.addedBy,
            ...values,
        })
        .returning();

    return inserted;
};

const resolveEntityContext = async (
    executor: any,
    entityType: PricedEntityType,
    entityId: string,
    platformId: string
) => {
    if (entityType === "ORDER") {
        const [row] = await executor
            .select({
                entity_id: orders.id,
                pricing_id: orders.order_pricing_id,
                company_margin: companies.platform_margin_percent,
                company_ops_rate: companies.warehouse_ops_rate,
                company_vat_percent_override: companies.vat_percent_override,
                company_features: companies.features,
                platform_features: platforms.features,
                platform_vat_percent: platforms.vat_percent,
                created_by: orders.created_by,
                calculated_totals: orders.calculated_totals,
            })
            .from(orders)
            .leftJoin(companies, eq(orders.company_id, companies.id))
            .leftJoin(platforms, eq(orders.platform_id, platforms.id))
            .where(and(eq(orders.id, entityId), eq(orders.platform_id, platformId)))
            .limit(1);
        if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
        return {
            entity_id: row.entity_id,
            pricing_id: row.pricing_id as string | null,
            company_margin: toNum(row.company_margin),
            company_ops_rate: toNum(row.company_ops_rate),
            vat_percent:
                row.company_vat_percent_override !== null &&
                row.company_vat_percent_override !== undefined
                    ? toNum(row.company_vat_percent_override)
                    : toNum(row.platform_vat_percent),
            created_by: String(row.created_by),
            volume: toNum((row.calculated_totals as Record<string, unknown> | null)?.volume),
            enable_base_operations: resolveEffectiveFeature("enable_base_operations", {
                platformFeatures: row.platform_features as Record<string, unknown> | null,
                companyFeatures: row.company_features as Record<string, unknown> | null,
            }),
        };
    }

    if (entityType === "INBOUND_REQUEST") {
        const [row] = await executor
            .select({
                entity_id: inboundRequests.id,
                pricing_id: inboundRequests.request_pricing_id,
                company_margin: companies.platform_margin_percent,
                company_ops_rate: companies.warehouse_ops_rate,
                company_vat_percent_override: companies.vat_percent_override,
                company_features: companies.features,
                platform_features: platforms.features,
                platform_vat_percent: platforms.vat_percent,
                created_by: inboundRequests.created_by,
            })
            .from(inboundRequests)
            .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
            .leftJoin(platforms, eq(inboundRequests.platform_id, platforms.id))
            .where(
                and(eq(inboundRequests.id, entityId), eq(inboundRequests.platform_id, platformId))
            )
            .limit(1);
        if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
        const [volumeRow] = await executor
            .select({
                total_volume: sql<string>`COALESCE(SUM(${inboundRequestItems.quantity} * ${inboundRequestItems.volume_per_unit}), 0)`,
            })
            .from(inboundRequestItems)
            .where(eq(inboundRequestItems.inbound_request_id, entityId));
        return {
            entity_id: row.entity_id,
            pricing_id: row.pricing_id as string | null,
            company_margin: toNum(row.company_margin),
            company_ops_rate: toNum(row.company_ops_rate),
            vat_percent:
                row.company_vat_percent_override !== null &&
                row.company_vat_percent_override !== undefined
                    ? toNum(row.company_vat_percent_override)
                    : toNum(row.platform_vat_percent),
            created_by: String(row.created_by),
            volume: toNum(volumeRow?.total_volume),
            enable_base_operations: resolveEffectiveFeature("enable_base_operations", {
                platformFeatures: row.platform_features as Record<string, unknown> | null,
                companyFeatures: row.company_features as Record<string, unknown> | null,
            }),
        };
    }

    if (entityType === "SELF_PICKUP") {
        const [row] = await executor
            .select({
                entity_id: selfPickups.id,
                pricing_id: selfPickups.self_pickup_pricing_id,
                company_margin: companies.platform_margin_percent,
                company_ops_rate: companies.warehouse_ops_rate,
                company_vat_percent_override: companies.vat_percent_override,
                company_features: companies.features,
                platform_features: platforms.features,
                platform_vat_percent: platforms.vat_percent,
                created_by: selfPickups.created_by,
                calculated_totals: selfPickups.calculated_totals,
            })
            .from(selfPickups)
            .leftJoin(companies, eq(selfPickups.company_id, companies.id))
            .leftJoin(platforms, eq(selfPickups.platform_id, platforms.id))
            .where(
                and(eq(selfPickups.id, entityId), eq(selfPickups.platform_id, platformId))
            )
            .limit(1);
        if (!row)
            throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
        return {
            entity_id: row.entity_id,
            pricing_id: row.pricing_id as string | null,
            company_margin: toNum(row.company_margin),
            company_ops_rate: toNum(row.company_ops_rate),
            vat_percent:
                row.company_vat_percent_override !== null &&
                row.company_vat_percent_override !== undefined
                    ? toNum(row.company_vat_percent_override)
                    : toNum(row.platform_vat_percent),
            created_by: String(row.created_by),
            volume: toNum(
                (row.calculated_totals as Record<string, unknown> | null)?.volume
            ),
            enable_base_operations: resolveEffectiveFeature("enable_base_operations", {
                platformFeatures: row.platform_features as Record<string, unknown> | null,
                companyFeatures: row.company_features as Record<string, unknown> | null,
            }),
        };
    }

    const [row] = await executor
        .select({
            entity_id: serviceRequests.id,
            pricing_id: serviceRequests.request_pricing_id,
            company_margin: companies.platform_margin_percent,
            company_ops_rate: companies.warehouse_ops_rate,
            company_vat_percent_override: companies.vat_percent_override,
            company_features: companies.features,
            platform_features: platforms.features,
            platform_vat_percent: platforms.vat_percent,
            created_by: serviceRequests.created_by,
        })
        .from(serviceRequests)
        .leftJoin(companies, eq(serviceRequests.company_id, companies.id))
        .leftJoin(platforms, eq(serviceRequests.platform_id, platforms.id))
        .where(and(eq(serviceRequests.id, entityId), eq(serviceRequests.platform_id, platformId)))
        .limit(1);
    if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
    return {
        entity_id: row.entity_id,
        pricing_id: row.pricing_id as string | null,
        company_margin: toNum(row.company_margin),
        company_ops_rate: toNum(row.company_ops_rate),
        vat_percent:
            row.company_vat_percent_override !== null &&
            row.company_vat_percent_override !== undefined
                ? toNum(row.company_vat_percent_override)
                : toNum(row.platform_vat_percent),
        created_by: String(row.created_by),
        volume: undefined,
        enable_base_operations: resolveEffectiveFeature("enable_base_operations", {
            platformFeatures: row.platform_features as Record<string, unknown> | null,
            companyFeatures: row.company_features as Record<string, unknown> | null,
        }),
    };
};

const ensurePricingRow = async (
    executor: any,
    params: {
        entityType: PricedEntityType;
        entityId: string;
        platformId: string;
        actorId: string;
        defaultMarginPercent: number;
        defaultVatPercent: number;
    }
) => {
    const existing = await executor
        .select({ id: prices.id })
        .from(prices)
        .where(
            and(
                eq(prices.platform_id, params.platformId),
                eq(prices.entity_type, params.entityType),
                eq(prices.entity_id, params.entityId)
            )
        )
        .limit(1);
    if (existing[0]?.id) return existing[0].id;

    const [created] = await executor
        .insert(prices)
        .values({
            platform_id: params.platformId,
            entity_type: params.entityType,
            entity_id: params.entityId,
            breakdown_lines: [],
            margin_percent: params.defaultMarginPercent.toFixed(2),
            vat_percent: params.defaultVatPercent.toFixed(2),
            margin_is_override: false,
            margin_override_reason: null,
            calculated_by: params.actorId,
            calculated_at: new Date(),
        })
        .returning({ id: prices.id });

    if (params.entityType === "ORDER") {
        await executor
            .update(orders)
            .set({ order_pricing_id: created.id, updated_at: new Date() })
            .where(eq(orders.id, params.entityId));
    } else if (params.entityType === "INBOUND_REQUEST") {
        await executor
            .update(inboundRequests)
            .set({ request_pricing_id: created.id, updated_at: new Date() })
            .where(eq(inboundRequests.id, params.entityId));
    } else if (params.entityType === "SELF_PICKUP") {
        await executor
            .update(selfPickups)
            .set({ self_pickup_pricing_id: created.id, updated_at: new Date() })
            .where(eq(selfPickups.id, params.entityId));
    } else {
        await executor
            .update(serviceRequests)
            .set({ request_pricing_id: created.id, updated_at: new Date() })
            .where(eq(serviceRequests.id, params.entityId));
    }

    return created.id;
};

const buildInitialPricing = (params: BuildInitialPricingParams) => {
    const now = new Date();
    const marginPercent = roundCurrency(params.margin_percent);
    const vatPercent = roundCurrency(toNum(params.vat_percent));

    return {
        platform_id: params.platform_id,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        breakdown_lines: [],
        margin_percent: marginPercent.toFixed(2),
        vat_percent: vatPercent.toFixed(2),
        margin_is_override: false,
        margin_override_reason: null,
        calculated_at: now,
        calculated_by: params.calculated_by,
    };
};

const rebuildBreakdown = async (params: RebuildBreakdownParams) => {
    const executor = params.tx ?? db;
    const context = await resolveEntityContext(
        executor,
        params.entity_type,
        params.entity_id,
        params.platform_id
    );

    const pricingId = await ensurePricingRow(executor, {
        entityType: params.entity_type,
        entityId: params.entity_id,
        platformId: params.platform_id,
        actorId: params.calculated_by,
        defaultMarginPercent: context.company_margin,
        defaultVatPercent: context.vat_percent,
    });

    const [pricingRow] = await executor
        .select({
            id: prices.id,
            margin_percent: prices.margin_percent,
            vat_percent: prices.vat_percent,
            margin_is_override: prices.margin_is_override,
            margin_override_reason: prices.margin_override_reason,
            breakdown_lines: prices.breakdown_lines,
            calculated_at: prices.calculated_at,
        })
        .from(prices)
        .where(eq(prices.id, pricingId))
        .limit(1);

    let marginPercent = context.company_margin;
    let marginIsOverride = false;
    let marginOverrideReason: string | null = null;

    if (params.set_margin_override) {
        marginPercent = roundCurrency(params.set_margin_override.percent);
        marginIsOverride = true;
        marginOverrideReason = params.set_margin_override.reason || null;
    } else if (pricingRow?.margin_is_override) {
        marginPercent = toNum(pricingRow.margin_percent);
        marginIsOverride = true;
        marginOverrideReason = pricingRow.margin_override_reason ?? null;
    } else if (pricingRow?.margin_percent !== undefined && pricingRow?.margin_percent !== null) {
        marginPercent = toNum(pricingRow.margin_percent);
        marginIsOverride = false;
        marginOverrideReason = null;
    }

    const now = new Date();
    await syncSystemBaseLineItem(executor, {
        entityType: params.entity_type,
        entityId: params.entity_id,
        platformId: params.platform_id,
        addedBy: params.calculated_by,
        companyOpsRate: context.company_ops_rate,
        volume: context.volume,
        enableBaseOperations: context.enable_base_operations,
        baseOpsTotalOverride: params.base_ops_total_override,
    });
    const rawLineItems = await loadEntityLineItems(
        executor,
        params.entity_type,
        params.entity_id,
        params.platform_id
    );
    const pricingLines = buildBreakdownLinesFromLineItems(rawLineItems as any, marginPercent);
    const breakdownLines = pricingLines;

    await executor
        .update(prices)
        .set({
            entity_type: params.entity_type,
            entity_id: params.entity_id,
            breakdown_lines: breakdownLines,
            margin_percent: marginPercent.toFixed(2),
            vat_percent: context.vat_percent.toFixed(2),
            margin_is_override: marginIsOverride,
            margin_override_reason: marginOverrideReason,
            calculated_at: now,
            calculated_by: params.calculated_by,
        })
        .where(eq(prices.id, pricingId));

    const totals = calculateBreakdownTotals(breakdownLines, context.vat_percent);
    await eventBus.emit({
        platform_id: params.platform_id,
        event_type: EVENT_TYPES.PRICING_RECALCULATED,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        actor_id: params.calculated_by,
        actor_role: null,
        payload: {
            entity_id_readable: params.entity_id,
            company_id: "",
            company_name: "",
            pricing_id: pricingId,
            base_ops_total: totals.buy_base_ops_total,
            catalog_total: totals.buy_rate_card_total,
            custom_total: totals.buy_custom_total,
            margin_percent: marginPercent,
            vat_percent: context.vat_percent,
            final_total: totals.sell_total_with_vat,
            final_total_with_vat: totals.sell_total_with_vat,
            trigger:
                params.base_ops_total_override !== undefined
                    ? "base_ops_recalc"
                    : params.set_margin_override
                      ? "margin_override"
                      : "line_item_change",
        },
    });

    return {
        pricing_id: pricingId,
        margin_percent: marginPercent,
        vat_percent: context.vat_percent,
        margin_is_override: marginIsOverride,
        margin_override_reason: marginOverrideReason,
        buy_total: totals.buy_total,
        subtotal: totals.sell_total,
        final_total: totals.sell_total_with_vat,
        base_ops_total: totals.buy_base_ops_total,
        line_items: {
            catalog_total: totals.buy_rate_card_total,
            custom_total: totals.buy_custom_total,
        },
        vat: {
            percent: totals.sell_vat_percent,
            amount: totals.sell_vat_amount,
        },
        margin: {
            percent: marginPercent,
            amount: totals.margin_amount,
            is_override: marginIsOverride,
            override_reason: marginOverrideReason,
        },
        calculated_at: now,
    };
};

const projectByRole = (pricing: RawPricingRecord | null | undefined, role: PricingRole) => {
    if (!pricing) return null;
    const lines = parseBreakdownLines(pricing.breakdown_lines);
    const vatPercent = toNum(pricing.vat_percent);
    const totals = calculateBreakdownTotals(lines, vatPercent);
    const marginPolicy = {
        percent: toNum(pricing.margin_percent),
        is_override: !!pricing.margin_is_override,
        override_reason: pricing.margin_override_reason ?? null,
    };

    const adminLines = lines.map((line) => ({ ...line }));
    if (role === "ADMIN") {
        return {
            breakdown_lines: adminLines,
            lines: adminLines,
            totals,
            margin_policy: marginPolicy,
            calculated_at: pricing.calculated_at,
            // Legacy compatibility fields
            base_ops_total: totals.buy_base_ops_total,
            line_items: {
                catalog_total: totals.buy_rate_card_total,
                custom_total: totals.buy_custom_total,
            },
            vat: {
                percent: totals.sell_vat_percent,
                amount: totals.sell_vat_amount,
            },
            margin: {
                percent: marginPolicy.percent,
                amount: totals.margin_amount,
                is_override: marginPolicy.is_override,
                override_reason: marginPolicy.override_reason,
            },
            sell: {
                base_ops_total: totals.sell_base_ops_total,
                subtotal: totals.sell_total,
                vat_amount: totals.sell_vat_amount,
                final_total: totals.sell_total_with_vat,
            },
            subtotal: totals.sell_total.toFixed(2),
            final_total: totals.sell_total_with_vat.toFixed(2),
        };
    }

    if (role === "LOGISTICS") {
        const logisticsLines = lines.map((line) => ({
            line_id: line.line_id,
            line_kind: line.line_kind,
            category: line.category,
            label: line.label,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.buy_unit_price,
            total: line.buy_total,
            billing_mode: line.billing_mode,
            is_voided: line.is_voided,
            notes: line.notes,
        }));
        return {
            breakdown_lines: logisticsLines,
            lines: logisticsLines,
            totals: {
                base_ops_total: totals.buy_base_ops_total,
                rate_card_total: totals.buy_rate_card_total,
                custom_total: totals.buy_custom_total,
                total: totals.buy_total,
            },
            calculated_at: pricing.calculated_at,
            // Legacy compatibility fields
            base_ops_total: totals.buy_base_ops_total,
            line_items: {
                catalog_total: totals.buy_rate_card_total,
                custom_total: totals.buy_custom_total,
            },
            final_total: totals.buy_total.toFixed(2),
        };
    }

    const clientLines = lines
        .filter((line) => !shouldHideLineForClient(line))
        .map((line) => ({
            line_id: line.line_id,
            line_kind: line.line_kind,
            category: line.category,
            label: line.label,
            quantity: line.quantity,
            unit: line.unit,
            billing_mode: line.billing_mode,
            unit_price: line.client_price_visible ? line.sell_unit_price : null,
            total: line.client_price_visible ? line.sell_total : null,
            client_price_visible: line.client_price_visible,
        }));
    return {
        breakdown_lines: clientLines,
        lines: clientLines,
        totals: {
            base_ops_total: totals.sell_base_ops_total,
            rate_card_total: totals.sell_rate_card_total,
            custom_total: totals.sell_custom_total,
            subtotal: totals.sell_total,
            vat_percent: totals.sell_vat_percent,
            vat_amount: totals.sell_vat_amount,
            total: totals.sell_total_with_vat,
        },
        subtotal: totals.sell_total.toFixed(2),
        vat: {
            percent: totals.sell_vat_percent,
            amount: totals.sell_vat_amount,
        },
        final_total: totals.sell_total_with_vat.toFixed(2),
    };
};

const projectSummaryForRole = (pricing: RawPricingRecord | null | undefined, role: PricingRole) => {
    if (!pricing) return null;
    const lines = parseBreakdownLines(pricing.breakdown_lines);
    const vatPercent = toNum(pricing.vat_percent);
    const totals = calculateBreakdownTotals(lines, vatPercent);

    if (role === "LOGISTICS") {
        return {
            final_total: totals.buy_total.toFixed(2),
            calculated_at: pricing.calculated_at,
        };
    }
    if (role === "CLIENT") {
        return {
            subtotal: totals.sell_total.toFixed(2),
            vat_percent: totals.sell_vat_percent,
            vat_amount: totals.sell_vat_amount.toFixed(2),
            final_total: totals.sell_total_with_vat.toFixed(2),
        };
    }
    return {
        subtotal: totals.sell_total.toFixed(2),
        vat_percent: totals.sell_vat_percent,
        vat_amount: totals.sell_vat_amount.toFixed(2),
        final_total: totals.sell_total_with_vat.toFixed(2),
        buy_total: totals.buy_total.toFixed(2),
        margin_percent: toNum(pricing.margin_percent),
        calculated_at: pricing.calculated_at,
    };
};

const sumLineItems = (items: RawLineItem[]) => {
    let catalog = 0;
    let custom = 0;
    for (const item of items) {
        const voided = item.is_voided ?? item.isVoided ?? false;
        const billing = item.billing_mode ?? item.billingMode ?? "BILLABLE";
        if (voided || billing !== "BILLABLE") continue;
        const total = toNum(item.total);
        const type = item.line_item_type ?? item.lineItemType ?? "CATALOG";
        if (type === "SYSTEM") continue;
        if (type === "CUSTOM") custom += total;
        else catalog += total;
    }
    return { catalog_total: roundCurrency(catalog), custom_total: roundCurrency(custom) };
};

const projectLineItemsForRole = (
    items: RawLineItem[],
    marginPercent: number,
    role: PricingRole
) => {
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
            const clientPriceVisible =
                (item.client_price_visible ?? item.clientPriceVisible ?? false) === true;
            return {
                line_item_id: itemId,
                description: item.description || "",
                quantity: qty,
                category: item.category || undefined,
                unit_rate: clientPriceVisible ? sellUnitRate : null,
                total: clientPriceVisible ? sellTotal : null,
                client_price_visible: clientPriceVisible,
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

// Backward-compatible aliases used by existing modules.
const recalculate = (params: RebuildBreakdownParams) => rebuildBreakdown(params);
const projectForRole = (
    pricing: RawPricingRecord | null | undefined,
    _lineItems: RawLineItem[],
    role: PricingRole
) => projectByRole(pricing, role);

export const PricingService = {
    buildInitialPricing,
    rebuildBreakdown,
    recalculate,
    projectByRole,
    projectForRole,
    projectSummaryForRole,
    projectLineItemsForRole,
    sumLineItems,
    parseBreakdownLines,
    calculateBreakdownTotals,
};
