import { and, asc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import {
    companies,
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

export type PricedEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "SELF_PICKUP";
type PricingRole = "ADMIN" | "LOGISTICS" | "CLIENT";

// SYSTEM covers auto-managed line items (system_key-keyed). BASE_OPS is gone
// (removed 2026-07); the bucket survives as the substrate for future
// auto-spawn fee lines — see the system-key handler registry below + PLAN §11.
type BreakdownLineKind = "SYSTEM" | "RATE_CARD" | "CUSTOM";
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
    // logistics_visible mirrors the line column verbatim. Exposed to ADMIN
    // clients so the frontend can render the audience indicator without
    // re-querying. (The per-line apply_margin policy field was retired in the
    // pricing-ledger rewrite — sell is driven solely by sell_unit_rate.)
    logistics_visible: boolean;
    // Per-line sell override marker. When non-null, the line's sell_total was
    // set directly from this per-unit rate (margin math skipped). null means
    // the sell price was derived normally (buy × margin or buy passthrough).
    // ADMIN-only field — never projected to CLIENT/LOGISTICS.
    sell_unit_rate_override: number | null;
};

type BuildInitialPricingParams = {
    platform_id: string;
    entity_type: PricedEntityType;
    entity_id: string;
    margin_percent: number;
    vat_percent?: number;
    calculated_by: string;
};

type RebuildBreakdownParams = {
    entity_type: PricedEntityType;
    entity_id: string;
    platform_id: string;
    calculated_by: string;
    tx?: any;
};

type RawPricingRecord = {
    id?: string;
    platform_id?: string;
    entity_type?: PricedEntityType;
    entity_id?: string;
    margin_percent?: string | number | null;
    vat_percent?: string | number | null;
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
    sell_unit_rate?: string | number | null;
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
    buy_system_total: number;
    buy_rate_card_total: number;
    buy_custom_total: number;
    buy_total: number;
    sell_system_total: number;
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
    const rawLineKind = String(row.line_kind || "");
    // Read path tolerance: historical breakdown_lines JSONB (frozen financial
    // records — never rewritten) may carry the legacy "BASE_OPS" kind. Accept
    // it and normalize to "SYSTEM" so old snapshots still project + bucket
    // correctly. New writes only ever emit "SYSTEM".
    if (!["SYSTEM", "BASE_OPS", "RATE_CARD", "CUSTOM"].includes(rawLineKind)) return null;
    const lineKind = rawLineKind === "BASE_OPS" ? "SYSTEM" : rawLineKind;

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
        logistics_visible: row.logistics_visible === false ? false : true,
        // Old snapshots pre-dating the override field read back as null; new
        // snapshots round-trip the stored override value.
        sell_unit_rate_override:
            row.sell_unit_rate_override != null ? Number(row.sell_unit_rate_override) : null,
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
        buy_system_total: 0,
        buy_rate_card_total: 0,
        buy_custom_total: 0,
        buy_total: 0,
        sell_system_total: 0,
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
        if (line.line_kind === "SYSTEM") {
            totals.buy_system_total += buy;
            totals.sell_system_total += sell;
        } else if (line.line_kind === "RATE_CARD") {
            totals.buy_rate_card_total += buy;
            totals.sell_rate_card_total += sell;
        } else {
            totals.buy_custom_total += buy;
            totals.sell_custom_total += sell;
        }
    }

    totals.buy_system_total = roundCurrency(totals.buy_system_total);
    totals.buy_rate_card_total = roundCurrency(totals.buy_rate_card_total);
    totals.buy_custom_total = roundCurrency(totals.buy_custom_total);
    totals.sell_system_total = roundCurrency(totals.sell_system_total);
    totals.sell_rate_card_total = roundCurrency(totals.sell_rate_card_total);
    totals.sell_custom_total = roundCurrency(totals.sell_custom_total);

    totals.buy_total = roundCurrency(
        totals.buy_system_total + totals.buy_rate_card_total + totals.buy_custom_total
    );
    totals.sell_total = roundCurrency(
        totals.sell_system_total + totals.sell_rate_card_total + totals.sell_custom_total
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
            sell_unit_rate: lineItems.sell_unit_rate,
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
            logistics_visible: lineItems.logistics_visible,
        })
        .from(lineItems)
        .leftJoin(serviceTypes, eq(lineItems.service_type_id, serviceTypes.id))
        .where(
            and(eq(lineItems.platform_id, platformId), getLineItemCondition(entityType, entityId))
        )
        .orderBy(asc(lineItems.created_at));

// ── System-key handler registry ────────────────────────────────────────────
// SYSTEM line items (line_item_type='SYSTEM', keyed by system_key) route
// their breakdown-line construction through this registry. It is EMPTY after
// Phase 0 — BASE_OPS is gone. The future AUTO_FEE handler (percentage fee
// lines spawned from a parent line) plugs in here without touching the
// precedence logic again — see PLAN §11. A SYSTEM line with no registered
// handler falls through to the generic per-line treatment below (buy = its
// own total, sell per margin/override), which is a safe default.
type SystemLineHandler = (ctx: {
    item: Record<string, unknown>;
    marginPercent: number;
}) => Partial<BreakdownLine> | null;

const SYSTEM_LINE_HANDLERS: Record<string, SystemLineHandler> = {
    // AUTO_FEE: (ctx) => ({ ... })  ← plugs in here (PLAN §11)
};

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
        const systemKey = item.system_key ? String(item.system_key) : null;
        const isSystem = item.line_item_type === "SYSTEM";
        const billingMode = String(item.billing_mode || "BILLABLE");

        // Canonical per-line sell rate. NULL only for NON_BILLABLE/COMPLIMENTARY
        // lines (never charged) or a legacy in-flight BILLABLE row that predates
        // the 0072 stamp (defensive path below).
        const rawSellUnitRate =
            item.sell_unit_rate != null && item.sell_unit_rate !== ""
                ? toNum(item.sell_unit_rate)
                : null;

        // ── Sell precedence (PLAN §2.2) ────────────────────────────────────
        //   billing_mode != BILLABLE       → sell 0 (never charged)
        //   sell_unit_rate present         → sell = qty × rate  (the ledger path)
        //   SYSTEM line, no explicit rate  → sell = buy (safe passthrough; real
        //                                    SYSTEM lines route through the
        //                                    handler registry — none post-Phase-0)
        //   BILLABLE, rate NULL (legacy)   → defensive: derive from margin seed
        //                                    + warn (should never fire in steady
        //                                    state)
        let sellTotal: number;
        let sellUnitPrice: number;
        if (billingMode !== "BILLABLE") {
            sellTotal = 0;
            sellUnitPrice = 0;
        } else if (rawSellUnitRate !== null) {
            // Multiply THEN round once — never round the per-unit rate first
            // (rate 33.333 × qty 3 must yield 100.00, not 99.99). sellUnitPrice
            // is derived from sellTotal, mirroring how buyUnitPrice comes from
            // buyTotal, so the displayed unit × qty always reconciles to total.
            sellTotal = roundCurrency(quantity * rawSellUnitRate);
            sellUnitPrice =
                quantity > 0 ? roundCurrency(sellTotal / quantity) : roundCurrency(rawSellUnitRate);
        } else if (isSystem) {
            sellTotal = buyTotal;
            sellUnitPrice = buyUnitPrice;
        } else {
            // Voided lines legitimately have NULL sell_unit_rate — the 0072 stamp
            // deliberately skipped them (is_voided = false predicate), and they
            // are excluded from every total + projection. Only warn for LIVE
            // rows, where a NULL rate is a genuine "predates the stamp" signal.
            if (!item.is_voided) {
                console.warn(
                    `[pricing] BILLABLE line ${String(
                        item.line_item_id || item.id || "?"
                    )} is missing sell_unit_rate; deriving sell from margin seed ${marginPercent}% (defensive legacy path). This row predates the 0072 sell-rate stamp and should be restamped.`
                );
            }
            sellTotal = applyMarginPerLine(buyTotal, marginPercent);
            sellUnitPrice =
                quantity > 0
                    ? roundCurrency(sellTotal / quantity)
                    : applyMarginPerLine(buyUnitPrice, marginPercent);
        }

        const nowIso = new Date().toISOString();
        const baseLine: BreakdownLine = {
            line_id: String(item.line_item_id || ""),
            line_kind: isSystem
                ? "SYSTEM"
                : item.line_item_type === "CATALOG"
                  ? "RATE_CARD"
                  : "CUSTOM",
            category: String(item.category || "OTHER"),
            label: String(item.description || ""),
            quantity,
            unit: String(item.unit || "service"),
            buy_unit_price: buyUnitPrice,
            buy_total: buyTotal,
            sell_unit_price: sellUnitPrice,
            sell_total: sellTotal,
            billing_mode: (String(item.billing_mode || "BILLABLE") as any) || "BILLABLE",
            source: {
                mode: isSystem
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
            logistics_visible: item.logistics_visible === false ? false : true,
            sell_unit_rate_override: rawSellUnitRate,
        };

        // Route SYSTEM lines through the system-key handler registry (empty
        // after Phase 0). A handler may override buy/sell/label; absent a
        // handler the generic line above stands. See PLAN §11 (AUTO_FEE).
        if (isSystem && systemKey && SYSTEM_LINE_HANDLERS[systemKey]) {
            const override = SYSTEM_LINE_HANDLERS[systemKey]({ item, marginPercent });
            if (override) return { ...baseLine, ...override };
        }

        return baseLine;
    });

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
                company_vat_percent_override: companies.vat_percent_override,
                platform_vat_percent: platforms.vat_percent,
                created_by: orders.created_by,
                pricing_mode: orders.pricing_mode,
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
            vat_percent:
                row.company_vat_percent_override !== null &&
                row.company_vat_percent_override !== undefined
                    ? toNum(row.company_vat_percent_override)
                    : toNum(row.platform_vat_percent),
            created_by: String(row.created_by),
            pricing_mode: (row.pricing_mode as "STANDARD" | "NO_COST" | null) ?? "STANDARD",
        };
    }

    if (entityType === "INBOUND_REQUEST") {
        const [row] = await executor
            .select({
                entity_id: inboundRequests.id,
                pricing_id: inboundRequests.request_pricing_id,
                company_margin: companies.platform_margin_percent,
                company_vat_percent_override: companies.vat_percent_override,
                platform_vat_percent: platforms.vat_percent,
                created_by: inboundRequests.created_by,
                pricing_mode: inboundRequests.pricing_mode,
            })
            .from(inboundRequests)
            .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
            .leftJoin(platforms, eq(inboundRequests.platform_id, platforms.id))
            .where(
                and(eq(inboundRequests.id, entityId), eq(inboundRequests.platform_id, platformId))
            )
            .limit(1);
        if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
        return {
            entity_id: row.entity_id,
            pricing_id: row.pricing_id as string | null,
            company_margin: toNum(row.company_margin),
            vat_percent:
                row.company_vat_percent_override !== null &&
                row.company_vat_percent_override !== undefined
                    ? toNum(row.company_vat_percent_override)
                    : toNum(row.platform_vat_percent),
            created_by: String(row.created_by),
            pricing_mode: (row.pricing_mode as "STANDARD" | "NO_COST" | null) ?? "STANDARD",
        };
    }

    if (entityType === "SELF_PICKUP") {
        const [row] = await executor
            .select({
                entity_id: selfPickups.id,
                pricing_id: selfPickups.self_pickup_pricing_id,
                company_margin: companies.platform_margin_percent,
                company_vat_percent_override: companies.vat_percent_override,
                platform_vat_percent: platforms.vat_percent,
                created_by: selfPickups.created_by,
                pricing_mode: selfPickups.pricing_mode,
            })
            .from(selfPickups)
            .leftJoin(companies, eq(selfPickups.company_id, companies.id))
            .leftJoin(platforms, eq(selfPickups.platform_id, platforms.id))
            .where(and(eq(selfPickups.id, entityId), eq(selfPickups.platform_id, platformId)))
            .limit(1);
        if (!row) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
        return {
            entity_id: row.entity_id,
            pricing_id: row.pricing_id as string | null,
            company_margin: toNum(row.company_margin),
            vat_percent:
                row.company_vat_percent_override !== null &&
                row.company_vat_percent_override !== undefined
                    ? toNum(row.company_vat_percent_override)
                    : toNum(row.platform_vat_percent),
            created_by: String(row.created_by),
            pricing_mode: (row.pricing_mode as "STANDARD" | "NO_COST" | null) ?? "STANDARD",
        };
    }

    const [row] = await executor
        .select({
            entity_id: serviceRequests.id,
            pricing_id: serviceRequests.request_pricing_id,
            company_margin: companies.platform_margin_percent,
            company_vat_percent_override: companies.vat_percent_override,
            platform_vat_percent: platforms.vat_percent,
            created_by: serviceRequests.created_by,
            pricing_mode: serviceRequests.pricing_mode,
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
        vat_percent:
            row.company_vat_percent_override !== null &&
            row.company_vat_percent_override !== undefined
                ? toNum(row.company_vat_percent_override)
                : toNum(row.platform_vat_percent),
        created_by: String(row.created_by),
        pricing_mode: (row.pricing_mode as "STANDARD" | "NO_COST" | null) ?? "STANDARD",
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

    // ── NO_COST short-circuit ──────────────────────────────────────────────
    // Choke point for the "mark as no-cost" feature. Any entity whose
    // pricing_mode is NO_COST skips the entire pricing subsystem. syncSystem-
    // BaseLineItem inherits this (only called from rebuildBreakdown). This
    // guards against stray recalcs triggered by cron / line-item changes /
    // manual rebuilds — the pickup stays at zero, no BASE_OPS gets generated,
    // no rows get rewritten.
    if (context.pricing_mode === "NO_COST") {
        return {
            pricing_id: context.pricing_id,
            breakdown_lines: [] as Array<Record<string, unknown>>,
            final_total: 0,
            margin_amount: 0,
            vat_amount: 0,
            subtotal: 0,
        };
    }

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
            breakdown_lines: prices.breakdown_lines,
            calculated_at: prices.calculated_at,
        })
        .from(prices)
        .where(eq(prices.id, pricingId))
        .limit(1);

    // Margin seed resolution (blanket override retired — Phase 1, P1-6). The seed
    // is the company default on first build, then the stored prices.margin_percent
    // thereafter. There is NO runtime override path: per-line
    // line_items.sell_unit_rate is the only sell control (stamped at create/edit/
    // bulk-margin). The former `margin_is_override` / `margin_override_reason`
    // columns were dropped in migration 0073; the return shape below keeps the
    // (now constant) is_override:false / override_reason:null fields purely for
    // reader-shape stability.
    let marginPercent = context.company_margin;
    if (pricingRow?.margin_percent !== undefined && pricingRow?.margin_percent !== null) {
        marginPercent = toNum(pricingRow.margin_percent);
    }

    const now = new Date();
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
            system_total: totals.buy_system_total,
            catalog_total: totals.buy_rate_card_total,
            custom_total: totals.buy_custom_total,
            margin_percent: marginPercent,
            vat_percent: context.vat_percent,
            final_total: totals.sell_total_with_vat,
            final_total_with_vat: totals.sell_total_with_vat,
            trigger: "line_item_change",
        },
    });

    return {
        pricing_id: pricingId,
        margin_percent: marginPercent,
        vat_percent: context.vat_percent,
        margin_is_override: false,
        margin_override_reason: null,
        buy_total: totals.buy_total,
        subtotal: totals.sell_total,
        final_total: totals.sell_total_with_vat,
        system_total: totals.buy_system_total,
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
            is_override: false,
            override_reason: null,
        },
        calculated_at: now,
    };
};

/**
 * READ-ONLY recompute of an entity's breakdown TOTALS via the current engine,
 * WITHOUT writing anything. Used by the pricing-stamp tie-out harness
 * (src/db/scripts/verify-pricing-stamp-tieout.ts) to diff freshly-recomputed
 * totals against the stored breakdown snapshot. Mirrors rebuildBreakdown's
 * compute path (context resolve → NO_COST short-circuit → load line items →
 * build lines → total) minus persistence + event emit. The margin seed is the
 * stored prices.margin_percent (what rebuildBreakdown reads for a non-override
 * entity), so the recompute is 1:1 with a real rebuild.
 */
const recomputeTotalsForTieout = async (params: {
    entity_type: PricedEntityType;
    entity_id: string;
    platform_id: string;
    tx?: any;
}): Promise<{
    totals: BreakdownTotals;
    pricing_mode: "STANDARD" | "NO_COST";
    margin_seed: number;
    vat_percent: number;
} | null> => {
    const executor = params.tx ?? db;
    const context = await resolveEntityContext(
        executor,
        params.entity_type,
        params.entity_id,
        params.platform_id
    );
    const [pricingRow] = await executor
        .select({ margin_percent: prices.margin_percent, vat_percent: prices.vat_percent })
        .from(prices)
        .where(
            and(
                eq(prices.platform_id, params.platform_id),
                eq(prices.entity_type, params.entity_type),
                eq(prices.entity_id, params.entity_id)
            )
        )
        .limit(1);
    if (!pricingRow) return null;

    const vatPercent = toNum(pricingRow.vat_percent);
    const marginSeed = toNum(pricingRow.margin_percent);

    if (context.pricing_mode === "NO_COST") {
        return {
            totals: calculateBreakdownTotals([], vatPercent),
            pricing_mode: "NO_COST",
            margin_seed: marginSeed,
            vat_percent: vatPercent,
        };
    }

    const rawLineItems = await loadEntityLineItems(
        executor,
        params.entity_type,
        params.entity_id,
        params.platform_id
    );
    const lines = buildBreakdownLinesFromLineItems(rawLineItems as any, marginSeed);
    return {
        totals: calculateBreakdownTotals(lines, vatPercent),
        pricing_mode: "STANDARD",
        margin_seed: marginSeed,
        vat_percent: vatPercent,
    };
};

const projectByRole = (pricing: RawPricingRecord | null | undefined, role: PricingRole) => {
    if (!pricing) return null;
    const lines = parseBreakdownLines(pricing.breakdown_lines);
    const vatPercent = toNum(pricing.vat_percent);
    const totals = calculateBreakdownTotals(lines, vatPercent);
    const marginPolicy = {
        percent: toNum(pricing.margin_percent),
        // Blanket margin override retired (pricing-ledger). Kept as constant
        // false/null for reader-shape stability; the backing columns were
        // dropped in migration 0073.
        is_override: false,
        override_reason: null as string | null,
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
            system_total: totals.buy_system_total,
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
                system_total: totals.sell_system_total,
                subtotal: totals.sell_total,
                vat_amount: totals.sell_vat_amount,
                final_total: totals.sell_total_with_vat,
            },
            subtotal: totals.sell_total.toFixed(2),
            final_total: totals.sell_total_with_vat.toFixed(2),
        };
    }

    if (role === "LOGISTICS") {
        // Strip lines flagged logistics_visible=false AND voided lines BEFORE
        // building the display rows AND BEFORE computing totals. Both must not
        // appear in the view and must not count toward buy_total — otherwise
        // the displayed lines would not sum to the total and logistics would
        // see a phantom delta they can't explain. (calculateBreakdownTotals
        // already drops voided via shouldCountInTotals; the display list must
        // match it.)
        const visibleLines = lines.filter(
            (line) => line.logistics_visible !== false && !line.is_voided
        );
        const logisticsTotals = calculateBreakdownTotals(visibleLines, vatPercent);
        const logisticsLines = visibleLines.map((line) => ({
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
                system_total: logisticsTotals.buy_system_total,
                rate_card_total: logisticsTotals.buy_rate_card_total,
                custom_total: logisticsTotals.buy_custom_total,
                total: logisticsTotals.buy_total,
            },
            calculated_at: pricing.calculated_at,
            // Legacy compatibility fields
            system_total: logisticsTotals.buy_system_total,
            line_items: {
                catalog_total: logisticsTotals.buy_rate_card_total,
                custom_total: logisticsTotals.buy_custom_total,
            },
            final_total: logisticsTotals.buy_total.toFixed(2),
        };
    }

    // Exclude voided lines from the client display. calculateBreakdownTotals
    // already drops them from the totals (shouldCountInTotals), so without
    // this filter the client sees a voided line that the total doesn't
    // account for — the list stops reconciling with the final total.
    const clientLines = lines
        .filter((line) => !line.is_voided && !shouldHideLineForClient(line))
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
            system_total: totals.sell_system_total,
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

// Backward-compatible aliases used by existing modules.
const recalculate = (params: RebuildBreakdownParams) => rebuildBreakdown(params);
const projectForRole = (
    pricing: RawPricingRecord | null | undefined,
    _lineItems: RawLineItem[],
    role: PricingRole
) => projectByRole(pricing, role);

/**
 * Build all three role projections from a single pricing snapshot.
 * Used by admin-facing entity detail endpoints so the admin frontend can
 * preview Logistics + Client views without extra round-trips — and so the
 * preview is 1:1 with what each role actually receives (same projectByRole
 * function, same inputs).
 *
 * Cost: two extra in-memory projections; no DB calls. Negligible.
 */
const projectAllRolesForAdmin = (pricing: RawPricingRecord | null | undefined) => {
    if (!pricing) return null;
    return {
        admin: projectByRole(pricing, "ADMIN"),
        logistics: projectByRole(pricing, "LOGISTICS"),
        client: projectByRole(pricing, "CLIENT"),
    };
};

// ----------------------------------- MARK ENTITY AS NO-COST ------------------------------
// Entity-agnostic helper. Voids all active line items for this entity, zeros
// the prices row, flips pricing_mode→NO_COST + financial_status→NOT_APPLICABLE
// on the parent entity row. Does NOT transition status or emit events —
// callers own those since they're entity-specific (each entity has its own
// "approved without quote" target status + event type).
//
// Follow-up wiring when orders / inbound / service_request gain pricing_mode:
// add a branch to the switch at the bottom. Everything else (line-item void,
// prices zero, the two choke-point guards) works identically.
const markEntityAsNoCost = async (params: {
    entityType: PricedEntityType;
    entityId: string;
    platformId: string;
    actorId: string;
    tx?: any;
}): Promise<void> => {
    const executor = params.tx ?? db;

    // 1. Void all non-voided line items for this entity.
    //    Uses the existing getLineItemCondition helper — no new entity-routing
    //    code paths.
    await executor
        .update(lineItems)
        .set({
            is_voided: true,
            voided_at: new Date(),
            voided_by: params.actorId,
            void_reason: "Entity marked as no-cost",
            updated_at: new Date(),
        })
        .where(
            and(
                eq(lineItems.platform_id, params.platformId),
                eq(lineItems.is_voided, false),
                getLineItemCondition(params.entityType, params.entityId)
            )
        );

    // 2. Zero the prices row (if one exists). Keeps the row so polymorphic
    //    joins + historical readers don't break — just empty breakdown + zero
    //    totals. ensurePricingRow elsewhere already uses this exact shape on
    //    creation, so zeroing is schema-safe.
    await executor
        .update(prices)
        .set({
            breakdown_lines: [],
            margin_percent: "0",
            vat_percent: "0",
            calculated_at: new Date(),
            calculated_by: params.actorId,
        })
        .where(
            and(
                eq(prices.platform_id, params.platformId),
                eq(prices.entity_type, params.entityType),
                eq(prices.entity_id, params.entityId)
            )
        );

    // 3. Flip the parent entity's pricing_mode (+ financial_status where the
    //    entity has one). All four entities carry pricing_mode as of migration
    //    0071. ORDER / INBOUND / SELF_PICKUP additionally move financial_status
    //    to NOT_APPLICABLE (terminal — never invoiced). SERVICE_REQUEST has no
    //    financial_status column (it uses commercial_status); its status revert
    //    is owned by the caller wrapper (applyServiceRequestConcession) to keep
    //    the concession-revert semantics intact.
    switch (params.entityType) {
        case "SELF_PICKUP":
            await executor
                .update(selfPickups)
                .set({
                    pricing_mode: "NO_COST",
                    financial_status: "NOT_APPLICABLE",
                })
                .where(
                    and(
                        eq(selfPickups.id, params.entityId),
                        eq(selfPickups.platform_id, params.platformId)
                    )
                );
            break;
        case "ORDER":
            await executor
                .update(orders)
                .set({
                    pricing_mode: "NO_COST",
                    financial_status: "NOT_APPLICABLE",
                })
                .where(
                    and(eq(orders.id, params.entityId), eq(orders.platform_id, params.platformId))
                );
            break;
        case "INBOUND_REQUEST":
            await executor
                .update(inboundRequests)
                .set({
                    pricing_mode: "NO_COST",
                    financial_status: "NOT_APPLICABLE",
                })
                .where(
                    and(
                        eq(inboundRequests.id, params.entityId),
                        eq(inboundRequests.platform_id, params.platformId)
                    )
                );
            break;
        case "SERVICE_REQUEST":
            await executor
                .update(serviceRequests)
                .set({
                    pricing_mode: "NO_COST",
                })
                .where(
                    and(
                        eq(serviceRequests.id, params.entityId),
                        eq(serviceRequests.platform_id, params.platformId)
                    )
                );
            break;
    }
};

/**
 * Effective per-line margin seed for an entity, resolved EXACTLY as
 * rebuildBreakdown does (§2.1 stamp derivation): the stored prices.margin_percent
 * when present, else the company default (platform_margin_percent). Used by the
 * line-item create paths to stamp sell_unit_rate = applyMarginPerLine(unit_rate,
 * seed) at insert time so the "always stamped" invariant holds for new BILLABLE
 * lines (and the defensive restamp warn stays silent). 1:1 with what the next
 * rebuild would derive, so stamping introduces no financial drift.
 */
const resolveEntityMarginSeed = async (params: {
    entity_type: PricedEntityType;
    entity_id: string;
    platform_id: string;
    tx?: any;
}): Promise<number> => {
    const executor = params.tx ?? db;
    const context = await resolveEntityContext(
        executor,
        params.entity_type,
        params.entity_id,
        params.platform_id
    );
    const [pricingRow] = await executor
        .select({ margin_percent: prices.margin_percent })
        .from(prices)
        .where(
            and(
                eq(prices.platform_id, params.platform_id),
                eq(prices.entity_type, params.entity_type),
                eq(prices.entity_id, params.entity_id)
            )
        )
        .limit(1);
    let marginPercent = context.company_margin;
    if (pricingRow?.margin_percent !== undefined && pricingRow?.margin_percent !== null) {
        marginPercent = toNum(pricingRow.margin_percent);
    }
    return marginPercent;
};

export const PricingService = {
    buildInitialPricing,
    rebuildBreakdown,
    recalculate,
    projectByRole,
    projectForRole,
    projectSummaryForRole,
    projectAllRolesForAdmin,
    sumLineItems,
    parseBreakdownLines,
    calculateBreakdownTotals,
    markEntityAsNoCost,
    resolveEntityMarginSeed,
    recomputeTotalsForTieout,
};
