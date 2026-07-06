import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { inboundRequests, orders, prices, selfPickups, serviceRequests } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { PricingService } from "../../services/pricing.service";
import type { PricedEntityType } from "../../services/pricing.service";
import { LineItemsServices } from "../order-line-items/order-line-items.services";
import { projectLineItemsForClient } from "../order-line-items/order-line-items.utils";

// The four billable entity types share the polymorphic pricing/line-item
// infrastructure. Role-preview must resolve any of them.
const VALID_PURPOSE_TYPES: PricedEntityType[] = [
    "ORDER",
    "INBOUND_REQUEST",
    "SERVICE_REQUEST",
    "SELF_PICKUP",
];

// Only CLIENT / LOGISTICS are meaningful preview targets — ADMIN is the caller's
// own lens and is always returned alongside the preview.
export type PreviewRole = "CLIENT" | "LOGISTICS";
const VALID_PREVIEW_ROLES: PreviewRole[] = ["CLIENT", "LOGISTICS"];

// Resolve the entity row (validates platform ownership) and surface its pricing
// FK + pricing_mode. Each entity carries its own pricing FK column but they all
// point at the same polymorphic `prices` table. pricing_mode is present on all
// four as of migration 0071 (SP had it since 0047).
const resolveEntity = async (
    purposeType: PricedEntityType,
    entityId: string,
    platformId: string
): Promise<{ pricing_id: string | null; pricing_mode: string } | null> => {
    switch (purposeType) {
        case "ORDER": {
            const [row] = await db
                .select({
                    pricing_id: orders.order_pricing_id,
                    pricing_mode: orders.pricing_mode,
                })
                .from(orders)
                .where(and(eq(orders.id, entityId), eq(orders.platform_id, platformId)))
                .limit(1);
            return row
                ? { pricing_id: row.pricing_id ?? null, pricing_mode: row.pricing_mode }
                : null;
        }
        case "INBOUND_REQUEST": {
            const [row] = await db
                .select({
                    pricing_id: inboundRequests.request_pricing_id,
                    pricing_mode: inboundRequests.pricing_mode,
                })
                .from(inboundRequests)
                .where(
                    and(
                        eq(inboundRequests.id, entityId),
                        eq(inboundRequests.platform_id, platformId)
                    )
                )
                .limit(1);
            return row
                ? { pricing_id: row.pricing_id ?? null, pricing_mode: row.pricing_mode }
                : null;
        }
        case "SERVICE_REQUEST": {
            const [row] = await db
                .select({
                    pricing_id: serviceRequests.request_pricing_id,
                    pricing_mode: serviceRequests.pricing_mode,
                })
                .from(serviceRequests)
                .where(
                    and(
                        eq(serviceRequests.id, entityId),
                        eq(serviceRequests.platform_id, platformId)
                    )
                )
                .limit(1);
            return row
                ? { pricing_id: row.pricing_id ?? null, pricing_mode: row.pricing_mode }
                : null;
        }
        case "SELF_PICKUP": {
            const [row] = await db
                .select({
                    pricing_id: selfPickups.self_pickup_pricing_id,
                    pricing_mode: selfPickups.pricing_mode,
                })
                .from(selfPickups)
                .where(and(eq(selfPickups.id, entityId), eq(selfPickups.platform_id, platformId)))
                .limit(1);
            return row
                ? { pricing_id: row.pricing_id ?? null, pricing_mode: row.pricing_mode }
                : null;
        }
    }
};

// Map a purpose type to the line-items query filter GET /line-item expects.
const lineItemQueryFor = (purposeType: PricedEntityType, entityId: string) => {
    switch (purposeType) {
        case "ORDER":
            return { order_id: entityId, purpose_type: purposeType };
        case "INBOUND_REQUEST":
            return { inbound_request_id: entityId, purpose_type: purposeType };
        case "SERVICE_REQUEST":
            return { service_request_id: entityId, purpose_type: purposeType };
        case "SELF_PICKUP":
            return { self_pickup_id: entityId, purpose_type: purposeType };
    }
};

/**
 * ADMIN-only role-preview of an entity's pricing.
 *
 * Returns the money projection + per-line list EXACTLY as the requested role's
 * real detail endpoint would emit them — by calling the SAME functions the live
 * payloads use (no parallel implementation, so the projection stays the single
 * leak gate):
 *   - pricing:    PricingService.projectByRole(prices, role)  — same as every
 *     order/SP/inbound/SR detail endpoint's `order_pricing`/`request_pricing`.
 *   - line_items: CLIENT     → projectLineItemsForClient(...)  — the sell-only
 *                              allowlist getOrderById's CLIENT branch uses.
 *                 LOGISTICS  → LineItemsServices.getLineItems(..., "LOGISTICS")
 *                              — the same function+role GET /line-item serves a
 *                              logistics caller (logistics_visible filtered).
 *
 * The ADMIN projection + full editable line-item list are returned alongside so
 * the frontend can render the edit lens and the preview lens from one fetch.
 */
const getPricingPreview = async (
    platformId: string,
    purposeTypeRaw: string,
    entityId: string,
    roleRaw: string
) => {
    const purposeType = purposeTypeRaw as PricedEntityType;
    if (!VALID_PURPOSE_TYPES.includes(purposeType)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Invalid purposeType. Must be one of: ${VALID_PURPOSE_TYPES.join(", ")}`
        );
    }
    const role = roleRaw as PreviewRole;
    if (!VALID_PREVIEW_ROLES.includes(role)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Invalid role. Must be one of: ${VALID_PREVIEW_ROLES.join(", ")}`
        );
    }

    // Validates the entity exists AND belongs to the caller's platform.
    const entity = await resolveEntity(purposeType, entityId, platformId);
    if (!entity) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Entity not found");
    }

    // Load the polymorphic pricing snapshot via the entity's own FK (null =
    // not priced yet → projectByRole returns null → frontend renders "not
    // priced yet"). Selecting only the fields projectByRole consumes.
    const pricing = entity.pricing_id
        ? ((
              await db
                  .select({
                      breakdown_lines: prices.breakdown_lines,
                      margin_percent: prices.margin_percent,
                      vat_percent: prices.vat_percent,
                      calculated_at: prices.calculated_at,
                  })
                  .from(prices)
                  .where(and(eq(prices.id, entity.pricing_id), eq(prices.platform_id, platformId)))
                  .limit(1)
          )[0] ?? null)
        : null;

    const query = lineItemQueryFor(purposeType, entityId);

    // ADMIN line items: the full editable rows the ledger's edit lens needs —
    // identical to what GET /line-item serves an ADMIN caller.
    const adminLineItems = await LineItemsServices.getLineItems(platformId, query, "ADMIN");

    // Preview line items: mirror the requested role's real payload exactly.
    const previewLineItems =
        role === "CLIENT"
            ? projectLineItemsForClient(adminLineItems)
            : await LineItemsServices.getLineItems(platformId, query, "LOGISTICS");

    return {
        purpose_type: purposeType,
        entity_id: entityId,
        role,
        pricing_mode: entity.pricing_mode,
        admin: {
            pricing: PricingService.projectByRole(pricing as any, "ADMIN"),
            line_items: adminLineItems,
        },
        preview: {
            role,
            pricing: PricingService.projectByRole(pricing as any, role),
            line_items: previewLineItems,
        },
    };
};

export const PricingPreviewServices = {
    getPricingPreview,
};
