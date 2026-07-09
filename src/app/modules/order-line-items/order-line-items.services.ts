import { and, eq, inArray, ne, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    financialStatusHistory,
    inboundRequests,
    lineItemRequests,
    lineItems,
    orders,
    orderStatusHistory,
    prices,
    selfPickups,
    serviceRequests,
    serviceTypes,
    users,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import {
    BulkMarginPayload,
    CreateCatalogLineItemPayload,
    CreateCustomLineItemPayload,
    LineItemEditability,
    LineItemsTotals,
    PatchEntityLineItemsVisibilityPayload,
    PatchLineItemVisibilityPayload,
    PatchLineItemMetadataPayload,
    UpdateLineItemPayload,
    VoidLineItemPayload,
} from "./order-line-items.interfaces";
import {
    lineItemIdGenerator,
    lineItemQueryValidationConfig,
    projectLineItemsForLogistics,
} from "./order-line-items.utils";
import { buildOrderInfoBlockById } from "../../utils/helper-query";
import queryValidator from "../../utils/query-validator";
import { DocumentService } from "../../services/document.service";
import { applyMarginPerLine, roundCurrency } from "../../utils/pricing-engine";
import { eventBus } from "../../events/event-bus";
import { EVENT_TYPES } from "../../events/event-types";
import { PricingService, type PricedEntityType } from "../../services/pricing.service";
import { buildEntityUpdatedPayload, writeChangeHistory } from "../../utils/entity-change-history";

const LINE_ITEM_ID_UNIQUE_CONSTRAINT = "line_items_platform_line_item_id_unique";
const MAX_LINE_ITEM_ID_INSERT_RETRIES = 3;

const isLineItemIdConflict = (error: unknown) => {
    const pgError = error as { code?: string; constraint?: string };
    return pgError?.code === "23505" && pgError?.constraint === LINE_ITEM_ID_UNIQUE_CONSTRAINT;
};

// A missing S3 object (NoSuchKey / NotFound / 404) — surfaced either as a raw AWS
// SDK error or wrapped by deleteFileFromS3 into a generic "Failed to delete file
// from S3". Used to make estimate regen best-effort when no estimate exists yet.
const isMissingS3ObjectError = (error: unknown): boolean => {
    const e = error as {
        name?: string;
        message?: string;
        $metadata?: { httpStatusCode?: number };
    };
    return (
        e?.name === "NoSuchKey" ||
        e?.name === "NotFound" ||
        e?.$metadata?.httpStatusCode === 404 ||
        /failed to delete file from s3/i.test(e?.message ?? "")
    );
};

const runWithLineItemIdRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; attempt <= MAX_LINE_ITEM_ID_INSERT_RETRIES; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (!isLineItemIdConflict(error) || attempt === MAX_LINE_ITEM_ID_INSERT_RETRIES) {
                throw error;
            }
        }
    }

    throw new CustomizedError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to allocate unique line item id"
    );
};

const ORDER_FINANCIAL_LOCKED_STATUSES = ["QUOTE_ACCEPTED", "PENDING_INVOICE", "INVOICED", "PAID"];
const SERVICE_REQUEST_LOCKED_STATUSES = ["QUOTE_APPROVED", "INVOICED", "PAID"];

const buildEditability = (
    isLocked: boolean,
    lockStatus: string | null,
    reasonKind: "QUOTE_LOCK" | "NO_COST" = "QUOTE_LOCK"
): LineItemEditability => ({
    can_edit_pricing_fields: !isLocked,
    can_edit_metadata_fields: true,
    lock_reason: isLocked
        ? reasonKind === "NO_COST"
            ? "Entity is marked as no-cost — line items cannot be added or changed."
            : `Pricing fields are locked after quote acceptance (current status: ${lockStatus || "LOCKED"}).`
        : null,
});

const getLineItemEditability = async (
    item: {
        order_id: string | null;
        inbound_request_id: string | null;
        service_request_id: string | null;
        self_pickup_id?: string | null;
    },
    platformId: string
): Promise<LineItemEditability> => {
    if (item.order_id) {
        const [order] = await db
            .select({
                financial_status: orders.financial_status,
                pricing_mode: orders.pricing_mode,
            })
            .from(orders)
            .where(and(eq(orders.id, item.order_id), eq(orders.platform_id, platformId)))
            .limit(1);
        // NO_COST takes priority over status lock — a comped entity is always
        // locked (mirrors the SELF_PICKUP branch's choke-point guard).
        if (order?.pricing_mode === "NO_COST") {
            return buildEditability(true, order.financial_status || null, "NO_COST");
        }
        const status = order?.financial_status || null;
        return buildEditability(
            !!status && ORDER_FINANCIAL_LOCKED_STATUSES.includes(String(status)),
            status
        );
    }

    if (item.inbound_request_id) {
        const [request] = await db
            .select({
                financial_status: inboundRequests.financial_status,
                pricing_mode: inboundRequests.pricing_mode,
            })
            .from(inboundRequests)
            .where(
                and(
                    eq(inboundRequests.id, item.inbound_request_id),
                    eq(inboundRequests.platform_id, platformId)
                )
            )
            .limit(1);
        if (request?.pricing_mode === "NO_COST") {
            return buildEditability(true, request.financial_status || null, "NO_COST");
        }
        const status = request?.financial_status || null;
        return buildEditability(
            !!status && ORDER_FINANCIAL_LOCKED_STATUSES.includes(String(status)),
            status
        );
    }

    if (item.service_request_id) {
        const [request] = await db
            .select({
                commercial_status: serviceRequests.commercial_status,
                pricing_mode: serviceRequests.pricing_mode,
            })
            .from(serviceRequests)
            .where(
                and(
                    eq(serviceRequests.id, item.service_request_id),
                    eq(serviceRequests.platform_id, platformId)
                )
            )
            .limit(1);
        if (request?.pricing_mode === "NO_COST") {
            return buildEditability(true, request.commercial_status || null, "NO_COST");
        }
        const status = request?.commercial_status || null;
        return buildEditability(
            !!status && SERVICE_REQUEST_LOCKED_STATUSES.includes(String(status)),
            status
        );
    }

    if (item.self_pickup_id) {
        const [pickup] = await db
            .select({
                financial_status: selfPickups.financial_status,
                pricing_mode: selfPickups.pricing_mode,
            })
            .from(selfPickups)
            .where(
                and(
                    eq(selfPickups.id, item.self_pickup_id),
                    eq(selfPickups.platform_id, platformId)
                )
            )
            .limit(1);
        // NO_COST is the second structural choke point: all 6 line-item
        // mutations (createCatalog / createCustom / update / void / patch...)
        // call this function, so locking here = locking them all with one
        // change. Takes priority over status lock — a NO_COST pickup is
        // always locked regardless of its current status.
        if (pickup?.pricing_mode === "NO_COST") {
            return buildEditability(true, pickup.financial_status || null, "NO_COST");
        }
        const status = pickup?.financial_status || null;
        return buildEditability(
            !!status && ORDER_FINANCIAL_LOCKED_STATUSES.includes(String(status)),
            status
        );
    }

    return buildEditability(false, null);
};

// ----------------------------------- GET LINE ITEMS -----------------------------------------
const getLineItems = async (
    platformId: string,
    query: Record<string, any>,
    callerRole?: "ADMIN" | "LOGISTICS"
) => {
    const { order_id, inbound_request_id, service_request_id, self_pickup_id, purpose_type } =
        query;

    // Defense in depth: this endpoint is auth-gated to ADMIN+LOGISTICS and
    // scoped by platform, but without a parent-entity scope filter the query
    // would return every line item on the platform. That's the bug that let
    // self-pickup detail pages display other orders' line items before
    // self_pickup_id filtering was wired up. Reject unscoped reads outright
    // so a future entity type added to the shared pattern can't repeat this.
    if (!order_id && !inbound_request_id && !service_request_id && !self_pickup_id) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least one parent-entity filter (order_id / inbound_request_id / service_request_id / self_pickup_id) is required"
        );
    }

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
    if (self_pickup_id) {
        conditions.push(eq(lineItems.self_pickup_id, self_pickup_id));
    }

    if (purpose_type) {
        queryValidator(lineItemQueryValidationConfig, "purpose_type", purpose_type);
        conditions.push(eq(lineItems.purpose_type, purpose_type));
    }

    // LOGISTICS callers must NEVER see lines flagged logistics_visible=false.
    // Server-side filter — without it, warehouse OrderLineItemsList would
    // render hidden lines and defeat the whole visibility model. ADMIN sees
    // all rows so the role-preview tabs work; the projectByRole filter is
    // what governs what each tab actually renders.
    if (callerRole === "LOGISTICS") {
        conditions.push(eq(lineItems.logistics_visible, true));
    }

    const results = await db
        .select()
        .from(lineItems)
        .where(and(...conditions));

    // Provenance: which of these lines were created from an APPROVED logistics
    // line-item request (R3). The link lives on line_item_requests.approved_line_item_id
    // (set at approval — line-item-requests.services.ts). One batched reverse
    // lookup keyed by this entity's line ids. Surfaced as `lir_origin` (boolean)
    // + `line_item_request_id` (the readable LIR id) so the warehouse ledger can
    // render the unit_rate cell read-only for logistics (the server also hard-
    // blocks a logistics unit_rate change in updateLineItem).
    const resultLineIds = results.map((r) => r.id);
    const lirOriginRows = resultLineIds.length
        ? await db
              .select({
                  approved_line_item_id: lineItemRequests.approved_line_item_id,
                  line_item_request_id: lineItemRequests.line_item_request_id,
              })
              .from(lineItemRequests)
              .where(
                  and(
                      eq(lineItemRequests.platform_id, platformId),
                      eq(lineItemRequests.status, "APPROVED"),
                      inArray(lineItemRequests.approved_line_item_id, resultLineIds)
                  )
              )
        : [];
    const lirReadableByLineId = new Map(
        lirOriginRows
            .filter((r) => r.approved_line_item_id)
            .map((r) => [r.approved_line_item_id as string, r.line_item_request_id])
    );

    // Resolve the line creator's display name (owner feedback 2026-07-07 item 9)
    // so the admin ledger expand row shows a name instead of a raw added_by id.
    // One batched lookup over the distinct creators on this entity's lines.
    const creatorIds = [...new Set(results.map((r) => r.added_by).filter(Boolean))] as string[];
    const creatorRows = creatorIds.length
        ? await db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(inArray(users.id, creatorIds))
        : [];
    const creatorNameById = new Map(creatorRows.map((u) => [u.id, u.name]));

    const formattedResults = await Promise.all(
        results.map(async (item) => ({
            ...item,
            quantity: item.quantity ? parseFloat(item.quantity) : null,
            unit_rate: item.unit_rate ? parseFloat(item.unit_rate) : null,
            sell_unit_rate: item.sell_unit_rate != null ? parseFloat(item.sell_unit_rate) : null,
            total: parseFloat(item.total),
            added_by_name: item.added_by ? (creatorNameById.get(item.added_by) ?? null) : null,
            // R3 provenance flags (survive the LOGISTICS projection below).
            lir_origin: lirReadableByLineId.has(item.id),
            line_item_request_id: lirReadableByLineId.get(item.id) ?? null,
            ...(await getLineItemEditability(item, platformId)),
        }))
    );

    // LEAK GATE: the ADMIN-only sell override must never reach LOGISTICS. This
    // endpoint feeds the warehouse buy-only ledger + the admin role-preview's
    // "as logistics" lens; strip sell_unit_rate for LOGISTICS callers. ADMIN
    // keeps the full row (its own preview + edit lens need it).
    if (callerRole === "LOGISTICS") {
        return projectLineItemsForLogistics(formattedResults);
    }

    return formattedResults;
};

// ----------------------------------- CREATE CATALOG LINE ITEM -------------------------------
const createCatalogLineItem = async (data: CreateCatalogLineItemPayload) => {
    const {
        platform_id,
        order_id,
        inbound_request_id,
        service_request_id,
        self_pickup_id,
        purpose_type,
        service_type_id,
        quantity,
        notes,
        billing_mode,
        metadata,
        added_by,
        added_by_role,
    } = data;

    // Per-line sell override is ADMIN-only (mirrors the update-path guard).
    // Catalog-create is reachable by LOGISTICS (POST /catalog accepts both
    // roles) so reject a caller-supplied sell rate from logistics.
    if (added_by_role === "LOGISTICS" && data.sell_unit_rate !== undefined) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only Platform Admin can set a sell price override"
        );
    }

    // Get service type details
    const [serviceType] = await db
        .select()
        .from(serviceTypes)
        .where(and(eq(serviceTypes.id, service_type_id), eq(serviceTypes.platform_id, platform_id)))
        .limit(1);

    if (!serviceType) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service type not found");
    }

    const createEditability = await getLineItemEditability(
        {
            order_id: order_id || null,
            inbound_request_id: inbound_request_id || null,
            service_request_id: service_request_id || null,
            self_pickup_id: self_pickup_id || null,
        },
        platform_id
    );
    if (!createEditability.can_edit_pricing_fields) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            createEditability.lock_reason || "Pricing fields are locked"
        );
    }

    if (serviceType.default_rate === null || serviceType.default_rate === undefined) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Selected catalog service has no default rate configured"
        );
    }

    const effectiveMetadata = {
        ...(((serviceType as any).default_metadata || {}) as Record<string, unknown>),
        ...((metadata || {}) as Record<string, unknown>),
    };
    const effectiveBillingMode =
        added_by_role === "LOGISTICS" ? "BILLABLE" : billing_mode || "BILLABLE";

    // A per-line sell override only applies to BILLABLE lines (the projection
    // excludes NON_BILLABLE/COMPLIMENTARY sell from totals). Block setting a
    // value on a non-billable line; mirrors the update-path guard.
    if (typeof data.sell_unit_rate === "number" && effectiveBillingMode !== "BILLABLE") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "A sell price override only applies to billable lines"
        );
    }

    // Calculate total
    const total = quantity * Number(serviceType.default_rate);

    // Per-line sell override. NULL = fall back to margin math (seed-derived);
    // a value = fixed sell rate (stored as decimal string).
    let catalogSellUnitRate: string | null =
        data.sell_unit_rate === undefined || data.sell_unit_rate === null
            ? null
            : data.sell_unit_rate.toString();

    // §2.1 "always stamped" invariant: a BILLABLE line with no caller-supplied
    // sell (LOGISTICS can never supply one — the guard above blocks it) gets its
    // sell_unit_rate stamped server-side from the entity's margin seed — the same
    // derivation the next rebuild uses — so the defensive restamp warn stays
    // silent for new lines. NON_BILLABLE/COMPLIMENTARY keep NULL (engine sell 0).
    if (catalogSellUnitRate === null && effectiveBillingMode === "BILLABLE") {
        const marginSeed = await PricingService.resolveEntityMarginSeed({
            entity_type: purpose_type as PricedEntityType,
            entity_id: order_id || inbound_request_id || service_request_id || self_pickup_id || "",
            platform_id,
        });
        catalogSellUnitRate = applyMarginPerLine(
            Number(serviceType.default_rate),
            marginSeed
        ).toString();
    }

    const result = await runWithLineItemIdRetry(async () =>
        db.transaction(async (tx) => {
            const lineItemId = await lineItemIdGenerator(platform_id, tx);
            const [inserted] = await tx
                .insert(lineItems)
                .values({
                    platform_id,
                    line_item_id: lineItemId,
                    order_id: order_id || null,
                    inbound_request_id: inbound_request_id || null,
                    service_request_id: service_request_id || null,
                    self_pickup_id: self_pickup_id || null,
                    purpose_type,
                    service_type_id,
                    line_item_type: "CATALOG",
                    billing_mode: effectiveBillingMode,
                    category: serviceType.category,
                    description: serviceType.name,
                    quantity: quantity.toString(),
                    unit: serviceType.unit,
                    unit_rate: serviceType.default_rate,
                    sell_unit_rate: catalogSellUnitRate,
                    total: total.toString(),
                    added_by,
                    notes: notes || null,
                    metadata: effectiveMetadata,
                    client_price_visible: data.client_price_visible ?? false,
                    logistics_visible: data.logistics_visible ?? true,
                    client_visible: data.client_visible ?? true,
                })
                .returning();
            return inserted;
        })
    );

    // Update order pricing after adding new line item
    if (order_id) {
        await updateOrderPricingAfterLineItemChange(order_id, platform_id, added_by);
    }
    if (inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(
            inbound_request_id,
            platform_id,
            added_by
        );
    }
    if (service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(
            service_request_id,
            platform_id,
            added_by
        );
    }
    if (self_pickup_id) {
        await updateSelfPickupPricingAfterLineItemChange(self_pickup_id, platform_id, added_by);
    }

    const parentEntityId =
        order_id || inbound_request_id || service_request_id || self_pickup_id || "";
    await eventBus.emit({
        platform_id,
        event_type: EVENT_TYPES.LINE_ITEM_ADDED,
        entity_type: result.purpose_type as
            | "ORDER"
            | "INBOUND_REQUEST"
            | "SERVICE_REQUEST"
            | "SELF_PICKUP",
        entity_id: parentEntityId,
        actor_id: added_by,
        actor_role: null,
        payload: {
            entity_id_readable: result.line_item_id,
            company_id: parentEntityId,
            company_name: "",
            line_item_id: result.line_item_id,
            line_item_type: result.line_item_type,
            category: result.category || "",
            description: result.description || "",
            quantity: Number(result.quantity),
            unit_rate: Number(result.unit_rate),
            total: Number(result.total),
            purpose_type: result.purpose_type,
        },
    });

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        sell_unit_rate: result.sell_unit_rate != null ? parseFloat(result.sell_unit_rate) : null,
        total: parseFloat(result.total),
        ...(await getLineItemEditability(result, platform_id)),
    };
};

// ----------------------------------- CREATE CUSTOM LINE ITEM -------------------------------- //
const createCustomLineItem = async (data: CreateCustomLineItemPayload) => {
    const {
        platform_id,
        order_id,
        inbound_request_id,
        service_request_id,
        self_pickup_id,
        purpose_type,
        description,
        category,
        quantity,
        unit,
        unit_rate,
        notes,
        billing_mode,
        metadata,
        added_by,
        added_by_role,
    } = data;
    const total = quantity * unit_rate;
    const createEditability = await getLineItemEditability(
        {
            order_id: order_id || null,
            inbound_request_id: inbound_request_id || null,
            service_request_id: service_request_id || null,
            self_pickup_id: self_pickup_id || null,
        },
        platform_id
    );
    if (!createEditability.can_edit_pricing_fields) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            createEditability.lock_reason || "Pricing fields are locked"
        );
    }

    const parsedMetadata = (metadata || {}) as Record<string, unknown>;
    const effectiveBillingMode =
        added_by_role === "LOGISTICS" ? "BILLABLE" : billing_mode || "BILLABLE";

    // A per-line sell override only applies to BILLABLE lines. Custom-create
    // accepted a sell_unit_rate with no billing-mode check — the known
    // asymmetry vs updateLineItem. Close it: block setting a value on a
    // non-billable line (clearing via null is always allowed).
    if (typeof data.sell_unit_rate === "number" && effectiveBillingMode !== "BILLABLE") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "A sell price override only applies to billable lines"
        );
    }

    // Per-line sell override at create time. Route gates custom-create to
    // ADMIN, so no role check needed. NULL = fall back to margin math; a
    // value = fixed sell rate (stored as decimal string).
    let customSellUnitRate: string | null =
        data.sell_unit_rate === undefined || data.sell_unit_rate === null
            ? null
            : data.sell_unit_rate.toString();

    // §2.1 "always stamped" invariant: a BILLABLE line with no caller-supplied
    // sell gets its sell_unit_rate stamped server-side from the entity's margin
    // seed — the same derivation the next rebuild uses. NON_BILLABLE/COMPLIMENTARY
    // keep NULL (engine renders sell 0).
    if (customSellUnitRate === null && effectiveBillingMode === "BILLABLE") {
        const marginSeed = await PricingService.resolveEntityMarginSeed({
            entity_type: purpose_type as PricedEntityType,
            entity_id: order_id || inbound_request_id || service_request_id || self_pickup_id || "",
            platform_id,
        });
        customSellUnitRate = applyMarginPerLine(Number(unit_rate), marginSeed).toString();
    }

    const result = await runWithLineItemIdRetry(async () =>
        db.transaction(async (tx) => {
            const lineItemId = await lineItemIdGenerator(platform_id, tx);
            const [inserted] = await tx
                .insert(lineItems)
                .values({
                    platform_id,
                    order_id,
                    inbound_request_id: inbound_request_id || null,
                    service_request_id: service_request_id || null,
                    self_pickup_id: self_pickup_id || null,
                    line_item_id: lineItemId,
                    purpose_type,
                    service_type_id: null,
                    line_item_type: "CUSTOM",
                    billing_mode: effectiveBillingMode,
                    category: category as any,
                    description,
                    quantity: quantity.toString(),
                    unit,
                    unit_rate: unit_rate.toString(),
                    sell_unit_rate: customSellUnitRate,
                    total: total.toString(),
                    added_by,
                    notes: notes || null,
                    metadata: parsedMetadata,
                    client_price_visible: data.client_price_visible ?? false,
                    logistics_visible: data.logistics_visible ?? true,
                    client_visible: data.client_visible ?? true,
                })
                .returning();
            return inserted;
        })
    );

    // Update order pricing after adding new line item
    if (order_id) {
        await updateOrderPricingAfterLineItemChange(order_id, platform_id, added_by);
    }
    if (inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(
            inbound_request_id,
            platform_id,
            added_by
        );
    }
    if (service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(
            service_request_id,
            platform_id,
            added_by
        );
    }
    if (self_pickup_id) {
        await updateSelfPickupPricingAfterLineItemChange(self_pickup_id, platform_id, added_by);
    }

    const customParentEntityId =
        order_id || inbound_request_id || service_request_id || self_pickup_id || "";
    await eventBus.emit({
        platform_id,
        event_type: EVENT_TYPES.LINE_ITEM_ADDED,
        entity_type: result.purpose_type as
            | "ORDER"
            | "INBOUND_REQUEST"
            | "SERVICE_REQUEST"
            | "SELF_PICKUP",
        entity_id: customParentEntityId,
        actor_id: added_by,
        actor_role: null,
        payload: {
            entity_id_readable: result.line_item_id,
            company_id: customParentEntityId,
            company_name: "",
            line_item_id: result.line_item_id,
            line_item_type: result.line_item_type,
            category: result.category || "",
            description: result.description || "",
            quantity: Number(result.quantity),
            unit_rate: Number(result.unit_rate),
            total: Number(result.total),
            purpose_type: result.purpose_type,
        },
    });

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        sell_unit_rate: result.sell_unit_rate != null ? parseFloat(result.sell_unit_rate) : null,
        total: parseFloat(result.total),
        ...(await getLineItemEditability(result, platform_id)),
    };
};

// ----------------------------------- UPDATE LINE ITEM ---------------------------------------
const updateLineItem = async (
    id: string,
    platformId: string,
    data: UpdateLineItemPayload,
    userId: string,
    userRole: "ADMIN" | "LOGISTICS"
) => {
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
    if (existing.line_item_type === "SYSTEM") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "System-generated line items are recalculated automatically and cannot be edited directly"
        );
    }

    const editability = await getLineItemEditability(existing, platformId);
    // sell_unit_rate / quantity / unit_rate / billing_mode are pricing-affecting
    // fields — they change sell totals, so they hit the pricing-lock gate.
    // logistics_visible is NOT pricing-affecting (it's a display filter); admin
    // can flip it any time, including post-lock.
    const pricingFieldRequested =
        data.quantity !== undefined ||
        data.unit !== undefined ||
        data.unit_rate !== undefined ||
        data.billing_mode !== undefined ||
        data.sell_unit_rate !== undefined;
    if (!editability.can_edit_pricing_fields && pricingFieldRequested) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            editability.lock_reason || "Line is locked"
        );
    }
    if (userRole === "LOGISTICS" && data.billing_mode !== undefined) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only Platform Admin can change billing mode"
        );
    }
    if (userRole === "LOGISTICS" && data.sell_unit_rate !== undefined) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only Platform Admin can set a sell price override"
        );
    }
    // R3: a line created from an APPROVED logistics line-item request has its
    // unit_rate FROZEN for LOGISTICS — the rate was fixed by admin at approval.
    // Logistics may still edit quantity / notes; only the rate is locked. ADMIN
    // is unaffected. Fire the reverse-lookup only when logistics actually attempts
    // to CHANGE the rate (an idempotent resubmit of the same value is allowed).
    if (
        userRole === "LOGISTICS" &&
        data.unit_rate !== undefined &&
        Number(data.unit_rate) !== Number(existing.unit_rate ?? 0)
    ) {
        const [lirOrigin] = await db
            .select({ readable: lineItemRequests.line_item_request_id })
            .from(lineItemRequests)
            .where(
                and(
                    eq(lineItemRequests.approved_line_item_id, id),
                    eq(lineItemRequests.platform_id, platformId),
                    eq(lineItemRequests.status, "APPROVED")
                )
            )
            .limit(1);
        if (lirOrigin) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                `The unit rate on this line was set when line-item request ${lirOrigin.readable} was approved and can no longer be changed by logistics. Ask a Platform Admin to adjust it.`
            );
        }
    }
    // A per-line sell override only applies to BILLABLE lines — on NON_BILLABLE /
    // COMPLIMENTARY lines the projection excludes the line's sell from totals, so an
    // override there is silently dropped (misleading). Block setting a value; clearing
    // (explicit null) is always allowed. Use the EFFECTIVE billing mode so setting
    // billing_mode=BILLABLE + a sell override in the same request is permitted.
    if (typeof data.sell_unit_rate === "number") {
        const effectiveBillingMode = data.billing_mode ?? existing.billing_mode;
        if (effectiveBillingMode !== "BILLABLE") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "A sell price override only applies to billable lines"
            );
        }
    }
    if (
        userRole === "LOGISTICS" &&
        (data.logistics_visible !== undefined || data.client_visible !== undefined)
    ) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only Platform Admin can change visibility"
        );
    }

    const dbData: any = {
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.billing_mode !== undefined && { billing_mode: data.billing_mode }),
        ...(data.metadata !== undefined && { metadata: data.metadata }),
        ...(data.client_price_visible !== undefined && {
            client_price_visible: data.client_price_visible,
        }),
        ...(data.logistics_visible !== undefined && {
            logistics_visible: data.logistics_visible,
        }),
        ...(data.client_visible !== undefined && {
            client_visible: data.client_visible,
        }),
        // Per-line sell override. ABSENT = no change. Explicit null = clear the
        // override so pricing falls back to margin math. A value = fixed sell
        // rate (stored as decimal string). ADMIN-only (guarded above).
        ...(data.sell_unit_rate !== undefined && {
            sell_unit_rate: data.sell_unit_rate !== null ? data.sell_unit_rate.toString() : null,
        }),
    };

    const shouldRecalculateTotal =
        data.quantity !== undefined || data.unit !== undefined || data.unit_rate !== undefined;

    // For catalog items, recalculate total if quantity or unit_rate changed
    if (existing.line_item_type === "CATALOG" && shouldRecalculateTotal) {
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
    } else if (existing.line_item_type === "CUSTOM" && shouldRecalculateTotal) {
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

    // Trigger a rebuild whenever logistics_visible / client_price_visible change,
    // in addition to the existing pricing fields. logistics_visible affects what
    // LOGISTICS sees in the snapshot; client_price_visible affects what CLIENT
    // sees per line. Both need the breakdown_lines JSONB refreshed so downstream
    // readers see the new state.
    const visibilityOrPolicyChanged =
        data.logistics_visible !== undefined ||
        data.client_price_visible !== undefined ||
        data.client_visible !== undefined;
    const shouldTriggerRebuild = pricingFieldRequested || visibilityOrPolicyChanged;

    // F1 mode for the ORDER hook: a visibility-ONLY edit is display-only (REBUILD_ONLY — refresh the
    // snapshot, never pull back the quote); a pricing-field edit takes the default REVERT
    // (QUOTED → PENDING_APPROVAL).
    const orderPricingMode: OrderPricingUpdateMode =
        visibilityOrPolicyChanged && !pricingFieldRequested ? "REBUILD_ONLY" : "REVERT";

    if (shouldTriggerRebuild) {
        // Update order pricing after line item change
        if (result.order_id) {
            await updateOrderPricingAfterLineItemChange(
                result.order_id,
                platformId,
                userId,
                orderPricingMode
            );
        }
        if (result.inbound_request_id) {
            await updateInboundRequestPricingAfterLineItemChange(
                result.inbound_request_id,
                platformId,
                userId
            );
        }
        if (result.service_request_id) {
            await updateServiceRequestPricingAfterLineItemChange(
                result.service_request_id,
                platformId,
                userId
            );
        }
        if (result.self_pickup_id) {
            await updateSelfPickupPricingAfterLineItemChange(
                result.self_pickup_id,
                platformId,
                userId
            );
        }
    }

    const updateParentId =
        result.order_id ||
        result.inbound_request_id ||
        result.service_request_id ||
        result.self_pickup_id ||
        "";
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.LINE_ITEM_UPDATED,
        entity_type: result.purpose_type as
            | "ORDER"
            | "INBOUND_REQUEST"
            | "SERVICE_REQUEST"
            | "SELF_PICKUP",
        entity_id: updateParentId,
        actor_id: userId,
        actor_role: null,
        payload: {
            entity_id_readable: result.line_item_id,
            company_id: updateParentId,
            company_name: "",
            line_item_id: result.line_item_id,
            line_item_type: result.line_item_type,
            category: result.category || "",
            description: result.description || "",
            quantity: Number(result.quantity),
            unit_rate: Number(result.unit_rate),
            total: Number(result.total),
            previous_total: Number(existing.total),
            purpose_type: result.purpose_type,
            client_price_visible: result.client_price_visible,
        },
    });

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        sell_unit_rate: result.sell_unit_rate != null ? parseFloat(result.sell_unit_rate) : null,
        total: parseFloat(result.total),
        ...editability,
    };
};

// ----------------------------------- PATCH LINE ITEM METADATA ---------------------------------
const patchLineItemMetadata = async (
    id: string,
    platformId: string,
    data: PatchLineItemMetadataPayload,
    userId: string
) => {
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
    if (existing.line_item_type === "SYSTEM") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "System-generated line items are recalculated automatically and cannot be edited directly"
        );
    }

    const [result] = await db
        .update(lineItems)
        .set({
            ...(data.metadata !== undefined && { metadata: data.metadata }),
            ...(data.notes !== undefined && { notes: data.notes }),
        })
        .where(eq(lineItems.id, id))
        .returning();

    const editability = await getLineItemEditability(result, platformId);

    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.LINE_ITEM_UPDATED,
        entity_type: result.purpose_type as
            | "ORDER"
            | "INBOUND_REQUEST"
            | "SERVICE_REQUEST"
            | "SELF_PICKUP",
        entity_id:
            result.order_id ||
            result.inbound_request_id ||
            result.service_request_id ||
            result.self_pickup_id ||
            "",
        actor_id: userId,
        actor_role: null,
        payload: {
            entity_id_readable: result.line_item_id,
            line_item_id: result.line_item_id,
            purpose_type: result.purpose_type,
            metadata_updated: data.metadata !== undefined,
            notes_updated: data.notes !== undefined,
        },
    });

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        sell_unit_rate: result.sell_unit_rate != null ? parseFloat(result.sell_unit_rate) : null,
        total: parseFloat(result.total),
        ...editability,
    };
};

// ----------------------------------- PATCH LINE ITEM VISIBILITY ------------------------
// Combined audience patch. client_price_visible and/or logistics_visible —
// at least one is required (schema-enforced). Triggers a rebuild so the
// breakdown_lines snapshot picks up the new policy.
const patchLineItemVisibility = async (
    id: string,
    platformId: string,
    data: PatchLineItemVisibilityPayload,
    userId: string
) => {
    const [existing] = await db
        .select()
        .from(lineItems)
        .where(and(eq(lineItems.id, id), eq(lineItems.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Line item not found");
    }

    const [result] = await db
        .update(lineItems)
        .set({
            ...(data.client_price_visible !== undefined && {
                client_price_visible: data.client_price_visible,
            }),
            ...(data.logistics_visible !== undefined && {
                logistics_visible: data.logistics_visible,
            }),
            ...(data.client_visible !== undefined && {
                client_visible: data.client_visible,
            }),
            updated_at: new Date(),
        })
        .where(eq(lineItems.id, id))
        .returning();

    // Refresh the breakdown snapshot so role projections reflect the new flag(s). F1: a visibility
    // change is display-only — pass REBUILD_ONLY so it NEVER pulls a QUOTED order back to
    // PENDING_APPROVAL (client_visible / client_price_visible / logistics_visible change what a role
    // SEES, not what anything costs; the quote itself is still valid).
    if (result.order_id) {
        await updateOrderPricingAfterLineItemChange(
            result.order_id,
            platformId,
            userId,
            "REBUILD_ONLY"
        );
    }
    if (result.inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(
            result.inbound_request_id,
            platformId,
            userId
        );
    }
    if (result.service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(
            result.service_request_id,
            platformId,
            userId
        );
    }
    if (result.self_pickup_id) {
        await updateSelfPickupPricingAfterLineItemChange(result.self_pickup_id, platformId, userId);
    }

    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.LINE_ITEM_UPDATED,
        entity_type: result.purpose_type as
            | "ORDER"
            | "INBOUND_REQUEST"
            | "SERVICE_REQUEST"
            | "SELF_PICKUP",
        entity_id:
            result.order_id ||
            result.inbound_request_id ||
            result.service_request_id ||
            result.self_pickup_id ||
            "",
        actor_id: userId,
        actor_role: null,
        payload: {
            entity_id_readable: result.line_item_id,
            line_item_id: result.line_item_id,
            purpose_type: result.purpose_type,
            client_price_visible: result.client_price_visible,
            logistics_visible: result.logistics_visible,
        },
    });

    return {
        id: result.id,
        line_item_id: result.line_item_id,
        client_price_visible: result.client_price_visible,
        logistics_visible: result.logistics_visible,
        client_visible: result.client_visible,
    };
};

// ----------------------------------- BULK PATCH ENTITY VISIBILITY ---------------------
const patchEntityLineItemsVisibility = async (
    platformId: string,
    data: PatchEntityLineItemsVisibilityPayload,
    userId: string
) => {
    const targetId =
        data.purpose_type === "ORDER"
            ? data.order_id
            : data.purpose_type === "INBOUND_REQUEST"
              ? data.inbound_request_id
              : data.purpose_type === "SELF_PICKUP"
                ? (data as any).self_pickup_id
                : data.service_request_id;

    if (!targetId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Target entity id is required");
    }

    const getLineItemParentCondition = () => {
        switch (data.purpose_type) {
            case "ORDER":
                return eq(lineItems.order_id, targetId);
            case "INBOUND_REQUEST":
                return eq(lineItems.inbound_request_id, targetId);
            case "SELF_PICKUP":
                return eq(lineItems.self_pickup_id, targetId);
            default:
                return eq(lineItems.service_request_id, targetId);
        }
    };

    const conditions = [
        eq(lineItems.platform_id, platformId),
        eq(lineItems.purpose_type, data.purpose_type),
        getLineItemParentCondition(),
    ];

    if (data.line_item_ids && data.line_item_ids.length > 0) {
        conditions.push(inArray(lineItems.id, data.line_item_ids));
    }

    const updated = await db
        .update(lineItems)
        .set({
            ...(data.client_price_visible !== undefined && {
                client_price_visible: data.client_price_visible,
            }),
            ...(data.logistics_visible !== undefined && {
                logistics_visible: data.logistics_visible,
            }),
            ...(data.client_visible !== undefined && {
                client_visible: data.client_visible,
            }),
            updated_at: new Date(),
        })
        .where(and(...conditions))
        .returning({ id: lineItems.id });

    // Refresh the breakdown for the parent entity so role projections update. F1: bulk visibility is
    // display-only — REBUILD_ONLY so a QUOTED order is never pulled back for a display toggle.
    switch (data.purpose_type) {
        case "ORDER":
            await updateOrderPricingAfterLineItemChange(
                targetId,
                platformId,
                userId,
                "REBUILD_ONLY"
            );
            break;
        case "INBOUND_REQUEST":
            await updateInboundRequestPricingAfterLineItemChange(targetId, platformId, userId);
            break;
        case "SERVICE_REQUEST":
            await updateServiceRequestPricingAfterLineItemChange(targetId, platformId, userId);
            break;
        case "SELF_PICKUP":
            await updateSelfPickupPricingAfterLineItemChange(targetId, platformId, userId);
            break;
    }

    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.LINE_ITEM_UPDATED,
        entity_type: data.purpose_type as
            | "ORDER"
            | "INBOUND_REQUEST"
            | "SERVICE_REQUEST"
            | "SELF_PICKUP",
        entity_id: targetId,
        actor_id: userId,
        actor_role: null,
        payload: {
            entity_id_readable: targetId,
            purpose_type: data.purpose_type,
            client_price_visible: data.client_price_visible,
            logistics_visible: data.logistics_visible,
            updated_count: updated.length,
        },
    });

    return {
        purpose_type: data.purpose_type,
        target_id: targetId,
        client_price_visible: data.client_price_visible,
        logistics_visible: data.logistics_visible,
        client_visible: data.client_visible,
        updated_count: updated.length,
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
    if (existing.line_item_type === "SYSTEM") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "System-generated line items cannot be voided manually"
        );
    }

    const editability = await getLineItemEditability(existing, platformId);
    if (!editability.can_edit_pricing_fields) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            editability.lock_reason || "Line is locked"
        );
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

    // Update order pricing after line item void
    if (result.order_id) {
        await updateOrderPricingAfterLineItemChange(result.order_id, platformId, voided_by);
    }
    if (result.inbound_request_id) {
        await updateInboundRequestPricingAfterLineItemChange(
            result.inbound_request_id,
            platformId,
            voided_by
        );
    }
    if (result.service_request_id) {
        await updateServiceRequestPricingAfterLineItemChange(
            result.service_request_id,
            platformId,
            voided_by
        );
    }
    if (result.self_pickup_id) {
        await updateSelfPickupPricingAfterLineItemChange(
            result.self_pickup_id,
            platformId,
            voided_by
        );
    }

    const voidParentId =
        result.order_id ||
        result.inbound_request_id ||
        result.service_request_id ||
        result.self_pickup_id ||
        "";
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.LINE_ITEM_VOIDED,
        entity_type: result.purpose_type as
            | "ORDER"
            | "INBOUND_REQUEST"
            | "SERVICE_REQUEST"
            | "SELF_PICKUP",
        entity_id: voidParentId,
        actor_id: voided_by,
        actor_role: null,
        payload: {
            entity_id_readable: result.line_item_id,
            company_id: voidParentId,
            company_name: "",
            line_item_id: result.line_item_id,
            void_reason: void_reason || "",
            purpose_type: result.purpose_type,
        },
    });

    return {
        ...result,
        quantity: result.quantity ? parseFloat(result.quantity) : null,
        unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
        sell_unit_rate: result.sell_unit_rate != null ? parseFloat(result.sell_unit_rate) : null,
        total: parseFloat(result.total),
    };
};

// ----------------------------------- BULK MARGIN --------------------------------------------
// Stamp an explicit per-line sell rate on every BILLABLE, non-SYSTEM, non-voided
// line of one entity: sell_unit_rate = ROUND(unit_rate × (1 + pct/100), 2)
// (PLAN R3). This REPLACES the retired blanket margin override with a one-time
// per-line stamp — it does NOT change the entity's margin seed (prices.margin_percent,
// R4). One transaction stamps + writes the ORDER/SP audit row, then a single
// rebuild via the entity's post-quote revert hook (identical to a single-line
// edit) reprices + reverts a QUOTED order to PENDING_APPROVAL. Emits the
// PRICING_RECALCULATED audit event tagged {action:'bulk_margin'} (R5).
const bulkMarginLineItems = async (platformId: string, data: BulkMarginPayload, userId: string) => {
    const { purpose_type, entity_id, margin_percent, reason } = data;

    const parentCondition =
        purpose_type === "ORDER"
            ? eq(lineItems.order_id, entity_id)
            : purpose_type === "INBOUND_REQUEST"
              ? eq(lineItems.inbound_request_id, entity_id)
              : purpose_type === "SELF_PICKUP"
                ? eq(lineItems.self_pickup_id, entity_id)
                : eq(lineItems.service_request_id, entity_id);

    // Pricing lock gate — same as a single-line pricing edit. A no-cost /
    // quote-accepted entity cannot be re-priced.
    const editability = await getLineItemEditability(
        {
            order_id: purpose_type === "ORDER" ? entity_id : null,
            inbound_request_id: purpose_type === "INBOUND_REQUEST" ? entity_id : null,
            service_request_id: purpose_type === "SERVICE_REQUEST" ? entity_id : null,
            self_pickup_id: purpose_type === "SELF_PICKUP" ? entity_id : null,
        },
        platformId
    );
    if (!editability.can_edit_pricing_fields) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            editability.lock_reason || "Pricing fields are locked"
        );
    }

    const updated = await db.transaction(async (tx) => {
        const rows = await tx
            .update(lineItems)
            .set({
                // ROUND to 2dp so the stamped rate is representable in decimal(10,2)
                // and matches the engine's qty×rate sell math exactly.
                sell_unit_rate: sql`ROUND(${lineItems.unit_rate}::numeric * (1 + ${margin_percent}::numeric / 100.0), 2)`,
                updated_at: new Date(),
            })
            .where(
                and(
                    eq(lineItems.platform_id, platformId),
                    parentCondition,
                    eq(lineItems.is_voided, false),
                    ne(lineItems.line_item_type, "SYSTEM"),
                    eq(lineItems.billing_mode, "BILLABLE")
                )
            )
            .returning({ id: lineItems.id });

        // R5 audit: one entity_change_history row for ORDER / SELF_PICKUP. Skip
        // entirely when nothing was updated (zero eligible lines, or a
        // cross-tenant entity_id whose parentCondition matched no rows) so no
        // audit trail / event is written for a no-op. The readable-ref lookups
        // are platform-scoped so a cross-platform entity_id can't leak the other
        // tenant's human ref into this platform's audit row.
        if (rows.length > 0 && (purpose_type === "ORDER" || purpose_type === "SELF_PICKUP")) {
            const [readable] =
                purpose_type === "ORDER"
                    ? await tx
                          .select({ ref: orders.order_id })
                          .from(orders)
                          .where(and(eq(orders.id, entity_id), eq(orders.platform_id, platformId)))
                          .limit(1)
                    : await tx
                          .select({ ref: selfPickups.self_pickup_id })
                          .from(selfPickups)
                          .where(
                              and(
                                  eq(selfPickups.id, entity_id),
                                  eq(selfPickups.platform_id, platformId)
                              )
                          )
                          .limit(1);
            await writeChangeHistory(tx, {
                platformId,
                entityType: purpose_type,
                entityId: entity_id,
                entityIdReadable: readable?.ref ?? null,
                changed: [
                    {
                        field: "bulk_margin",
                        old: null,
                        new: reason ? `${margin_percent}% — ${reason}` : `${margin_percent}%`,
                        tier: "A",
                    },
                ],
                actorId: userId,
                actorRole: "ADMIN",
            });
        }

        return rows;
    });

    // Nothing repriced (zero eligible lines / cross-tenant no-op) → skip the
    // rebuild + audit event entirely so a no-op call leaves no trace.
    if (updated.length > 0) {
        // Single rebuild via the entity's post-quote revert hook — same path a
        // single-line edit takes (rebuild + QUOTED→PENDING_APPROVAL revert +
        // estimate regen where applicable).
        switch (purpose_type) {
            case "ORDER":
                await updateOrderPricingAfterLineItemChange(entity_id, platformId, userId);
                break;
            case "INBOUND_REQUEST":
                await updateInboundRequestPricingAfterLineItemChange(entity_id, platformId, userId);
                break;
            case "SERVICE_REQUEST":
                await updateServiceRequestPricingAfterLineItemChange(entity_id, platformId, userId);
                break;
            case "SELF_PICKUP":
                await updateSelfPickupPricingAfterLineItemChange(entity_id, platformId, userId);
                break;
        }

        // R5 audit event — the existing PRICING_RECALCULATED event, tagged with
        // the bulk-margin action so history/audit can distinguish it from a plain
        // reprice.
        await eventBus.emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.PRICING_RECALCULATED,
            entity_type: purpose_type as
                | "ORDER"
                | "INBOUND_REQUEST"
                | "SERVICE_REQUEST"
                | "SELF_PICKUP",
            entity_id,
            actor_id: userId,
            actor_role: "ADMIN",
            payload: {
                entity_id_readable: entity_id,
                company_id: "",
                company_name: "",
                action: "bulk_margin",
                percent: margin_percent,
                reason: reason || null,
                updated_count: updated.length,
            },
        });
    }

    return {
        purpose_type,
        entity_id,
        margin_percent,
        updated_count: updated.length,
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
        } else if (item.line_item_type === "CUSTOM") {
            customTotal += itemTotal;
        }
    }

    return {
        catalog_total: roundCurrency(catalogTotal),
        custom_total: roundCurrency(customTotal),
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
        } else if (item.line_item_type === "CUSTOM") {
            customTotal += itemTotal;
        }
    }

    return {
        catalog_total: roundCurrency(catalogTotal),
        custom_total: roundCurrency(customTotal),
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
        } else if (item.line_item_type === "CUSTOM") {
            customTotal += itemTotal;
        }
    }

    return {
        catalog_total: roundCurrency(catalogTotal),
        custom_total: roundCurrency(customTotal),
    };
};

// ----------------------------------- UPDATE ORDER PRICING AFTER LINE ITEM CHANGE ------------
// F1 revert-mode selector for the ORDER post-line-item-change hook:
//   REVERT       — default. A pricing-affecting change on a QUOTED order pulls the quote back to
//                  PENDING_APPROVAL + QUOTE_REVISED + fires the re-review notification.
//   REBUILD_ONLY — visibility toggles. Refresh the breakdown snapshot so role projections pick up
//                  the new display flags, but never touch order status (display-only). (F7 later
//                  extends this union with a QUIET_AMEND value.)
type OrderPricingUpdateMode = "REVERT" | "REBUILD_ONLY";

const updateOrderPricingAfterLineItemChange = async (
    orderId: string,
    platformId: string,
    userId: string,
    mode: OrderPricingUpdateMode = "REVERT"
): Promise<void> => {
    await PricingService.rebuildBreakdown({
        entity_type: "ORDER",
        entity_id: orderId,
        platform_id: platformId,
        calculated_by: userId,
    });

    // F1: a visibility/display-only change refreshes the breakdown snapshot (done above) but must
    // NOT pull back a sent quote — client_visible / client_price_visible / logistics_visible change
    // what each role SEES, not what anything COSTS. Bail before the QUOTED-revert logic.
    if (mode === "REBUILD_ONLY") return;

    // OQ10 reprice ripple: if the client has already seen a quote (order is QUOTED), a pricing
    // change invalidates it — bounce the order to PENDING_APPROVAL so the admin can re-review and
    // re-issue directly (adminApproveQuote requires PENDING_APPROVAL), flag financial_status
    // QUOTE_REVISED (blocks the now-stale estimate download until re-approval), and notify
    // admin/logistics (the dormant order.updated rules wake up on status_reverted=true). We do NOT
    // route back through PRICING_REVIEW: an admin-driven line-item change is a commercial edit, and a
    // logistics round-trip is pointless when the change may be admin-only (logistics_visible=false)
    // — admin can still hand it back via "Return to Logistics" when warehouse input is genuinely
    // needed. Pre-quote states (SUBMITTED/PRICING_REVIEW/PENDING_APPROVAL) just recalc in place. The
    // estimate PDF regenerates when admin re-approves — calling generateEstimate mid-revision 400s.
    const [order] = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            order_status: orders.order_status,
            company_id: orders.company_id,
            contact_name: orders.contact_name,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    if (!order || order.order_status !== "QUOTED") return;

    // Wrap the status/financial flip + BOTH history inserts in a single transaction so a
    // crash mid-sequence can't half-revert the order (status moved but no history row, etc.).
    // rebuildBreakdown stays OUTSIDE the tx above — it manages its own writes.
    await db.transaction(async (tx) => {
        await tx
            .update(orders)
            .set({
                order_status: "PENDING_APPROVAL",
                financial_status: "QUOTE_REVISED",
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));

        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "PENDING_APPROVAL",
            notes: "Order edited after the quote was sent — returned to admin approval for re-review and re-issue.",
            updated_by: userId,
        });
        await tx.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "QUOTE_REVISED",
            notes: "Quote revised after a post-quote line item change.",
            updated_by: userId,
        });
    });

    const [company] = order.company_id
        ? await db
              .select({ name: companies.name })
              .from(companies)
              .where(eq(companies.id, order.company_id))
        : [];

    // Emit AFTER the transaction commits so a rolled-back revert never fires a re-review
    // notification. actor_role is left null (the actor's role isn't threaded through the 6
    // line-item call sites that reach here). changed:[] is intentional — a reprice ripple has no
    // field-level diff. The order.updated template renders the re-review lead off status_reverted
    // and skips its (now-guarded) changed-fields box when the list is empty, so we never emit the
    // bogus "Pricing: — → —" row that a synthetic {old:null,new:null} entry produced before.
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.ORDER_UPDATED,
        entity_type: "ORDER",
        entity_id: orderId,
        actor_id: userId,
        actor_role: null,
        payload: {
            ...buildEntityUpdatedPayload({
                entityIdReadable: order.order_id,
                companyId: order.company_id || "",
                companyName: company?.name || "N/A",
                contactName: order.contact_name,
                changed: [],
                statusReverted: true,
                repriceTriggered: true,
            }),
            order_info: await buildOrderInfoBlockById(order.id),
        },
    });
};

// ----------------------------------- UPDATE INBOUND REQUEST PRICING AFTER LINE ITEM CHANGE --
const updateInboundRequestPricingAfterLineItemChange = async (
    inboundRequestId: string,
    platformId: string,
    userId: string
): Promise<void> => {
    await PricingService.rebuildBreakdown({
        entity_type: "INBOUND_REQUEST",
        entity_id: inboundRequestId,
        platform_id: platformId,
        calculated_by: userId,
    });
    await DocumentService.regenerateEstimate("INBOUND_REQUEST", inboundRequestId, platformId);
};

// ----------------------------------- UPDATE SELF-PICKUP PRICING AFTER LINE ITEM CHANGE ------
// Mirrors updateOrderPricingAfterLineItemChange — rebuildBreakdown picks up the
// new line item totals.
const updateSelfPickupPricingAfterLineItemChange = async (
    selfPickupId: string,
    platformId: string,
    userId: string
): Promise<void> => {
    await PricingService.rebuildBreakdown({
        entity_type: "SELF_PICKUP",
        entity_id: selfPickupId,
        platform_id: platformId,
        calculated_by: userId,
    });
    // Regenerate the cost-estimate PDF so it reflects the new line item totals —
    // mirrors the inbound path. But an SP edited at PRICING_REVIEW may have no
    // estimate on S3 yet (the estimate is only generated once the pickup is quoted).
    // Swallow the S3 NoSuchKey / missing-file case (log-and-continue — pricing is
    // already rebuilt; the estimate will be generated fresh at quote time) and
    // rethrow anything else so genuine failures still surface.
    try {
        await DocumentService.regenerateEstimate("SELF_PICKUP", selfPickupId, platformId);
    } catch (error) {
        if (isMissingS3ObjectError(error)) {
            console.warn(
                `Skipped self-pickup ${selfPickupId} estimate regen — no estimate on S3 yet`,
                error
            );
            return;
        }
        throw error;
    }
};

// ----------------------------------- UPDATE SERVICE REQUEST PRICING AFTER LINE ITEM CHANGE --
const updateServiceRequestPricingAfterLineItemChange = async (
    serviceRequestId: string,
    platformId: string,
    userId: string
): Promise<void> => {
    const [serviceRequest] = await db
        .select({
            service_request: serviceRequests,
            company: {
                name: companies.name,
            },
            pricing: {
                id: prices.id,
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                calculated_at: prices.calculated_at,
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

    const result = await PricingService.rebuildBreakdown({
        entity_type: "SERVICE_REQUEST",
        entity_id: serviceRequestId,
        platform_id: platformId,
        calculated_by: userId,
    });

    await DocumentService.regenerateEstimate("SERVICE_REQUEST", serviceRequestId, platformId);

    const requiresRevision =
        serviceRequest.service_request.billing_mode === "CLIENT_BILLABLE" &&
        ["QUOTED", "QUOTE_APPROVED", "INVOICED", "PAID"].includes(
            serviceRequest.service_request.commercial_status
        );

    if (requiresRevision) {
        await db
            .update(serviceRequests)
            .set({
                commercial_status: "PENDING_QUOTE",
                // Re-quoting un-waives any prior no-cost decision (concession_*
                // columns retired in 0073 — pricing_mode is the sole signal now).
                pricing_mode: "STANDARD",
                updated_at: new Date(),
            })
            .where(eq(serviceRequests.id, serviceRequestId));

        await eventBus.emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.SERVICE_REQUEST_QUOTE_REVISED,
            entity_type: "SERVICE_REQUEST",
            entity_id: serviceRequest.service_request.id,
            actor_id: null,
            actor_role: null,
            payload: {
                entity_id_readable: serviceRequest.service_request.service_request_id,
                company_id: serviceRequest.service_request.company_id,
                company_name: serviceRequest.company?.name || "N/A",
                contact_name: "Client",
                final_total: result.final_total,
                revision_reason: "Line items changed after quote issuance",
                request_url: "",
            },
        });
    }
};

export const LineItemsServices = {
    getLineItems,
    createCatalogLineItem,
    createCustomLineItem,
    updateLineItem,
    patchLineItemMetadata,
    patchLineItemVisibility,
    patchEntityLineItemsVisibility,
    voidLineItem,
    bulkMarginLineItems,
    calculateOrderLineItemsTotals,
    calculateInboundRequestLineItemsTotals,
    calculateServiceRequestLineItemsTotals,
    updateOrderPricingAfterLineItemChange,
    updateServiceRequestPricingAfterLineItemChange,
};
