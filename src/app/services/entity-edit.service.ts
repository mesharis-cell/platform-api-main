/**
 * EntityEditService — the entity-agnostic spine for editing existing entities across the
 * four-entity pattern (orders, inbound_requests, service_requests, self_pickups).
 *
 * Pipeline (one DB transaction):
 *   1. resolveEditContext  — load + lock the row.
 *   2. assertEditable      — status-band gate + scope (owner | company | admin) + platform.
 *   3. classifyPatch       — allowlist filter + per-field Tier tag + diff vs current.
 *   4. Tier A write        — descriptive columns (active in P1).
 *   5. Tier B reprice      — money fields (P2; guarded here).
 *   6. Tier C reconcile    — inventory fields (P3; guarded here).
 *   7. edited-quote revert — Tier B/C edits reset to PRICING_REVIEW + QUOTE_REVISED (P2; OQ10).
 *   8. writeChangeHistory  — one audit row per changed field (in-tx).
 * After commit: emit the `*.updated` event (admin/logistics notified only on a re-review).
 *
 * P1 scope: ORDER, Tier A only. Tier B/C are rejected with a clear 400 until P2/P3 land.
 * The other three entity configs are filled in P4.
 */
import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import {
    assets,
    companies,
    financialStatusHistory,
    orderItems,
    orders,
    orderStatusHistory,
    selfPickupItems,
    selfPickups,
    selfPickupStatusHistory,
    serviceRequestItems,
    serviceRequests,
    serviceRequestStatusHistory,
    users,
} from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";
import { EntityType } from "../events/event-types";
import { eventBus } from "../events/event-bus";
import {
    computeBookingWindow,
    computeSelfPickupBookingWindow,
    reconcileBookings,
} from "../modules/order/order.utils";
import {
    addBusinessDays,
    formatDateInTimezone,
    getPlatformFeasibilityConfig,
} from "../shared/feasibility/feasibility.core";
import { PricingService } from "./pricing.service";
import { buildServiceRequestCodes } from "../utils/service-request-code";
import {
    buildEntityUpdatedPayload,
    diffChangedFields,
    ENTITY_UPDATED_EVENT_FOR,
    writeChangeHistory,
    type ChangedField,
    type ChangedFieldSpec,
    type FieldTier,
} from "../utils/entity-change-history";

export type EditableEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "SELF_PICKUP";

/** Who is performing the edit. `owner` = the creator; `company` = a back-office manager on a
 *  colleague's entity; `admin` = platform admin override. The route's requirePermission proves
 *  the capability; this service proves the row scope. */
export type EditScope = "owner" | "company" | "admin";

export type EditFieldSpec = {
    /** Patch key === drizzle/JS column field name. */
    field: string;
    tier: FieldTier;
    /** When true, only an `admin`-scope edit may set this field; otherwise it is dropped. */
    adminOnly?: boolean;
};

export type EntityEditConfig = {
    entityType: EntityType;
    /** Drizzle table handle. */
    table: any;
    /** Drizzle id column (for WHERE / locking). */
    idColumn: any;
    /** Row property names (drizzle field names) for the values we read off the loaded row. */
    statusKey: string;
    financialStatusKey?: string;
    companyKey: string;
    createdByKey: string;
    readableIdKey: string;
    contactNameKey?: string;
    /** Statuses in which an owner may fully edit. Outside this band the entity is locked. */
    editableBand: string[];
    /** Allowlisted, Tier-tagged editable fields. */
    fields: EditFieldSpec[];
    // ── P2/P3 (declared now, consumed later) ──
    quotedStatus?: string;
    pendingApprovalStatus?: string;
    pricingReviewStatus?: string;
    /** Set only for entities that hold inventory (orders, self_pickups). */
    bookingParentType?: "ORDER" | "SELF_PICKUP";
};

// Tier A (inert descriptive) fields for ORDER. Tier C (event dates) declared for P3; not yet
// accepted by the P1 edit schema and rejected by editEntity until the reconcile engine ships.
const ORDER_EDIT_CONFIG: EntityEditConfig = {
    entityType: "ORDER",
    table: orders,
    idColumn: orders.id,
    statusKey: "order_status",
    financialStatusKey: "financial_status",
    companyKey: "company_id",
    createdByKey: "created_by",
    readableIdKey: "order_id",
    contactNameKey: "contact_name",
    editableBand: ["SUBMITTED", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED"],
    quotedStatus: "QUOTED",
    pendingApprovalStatus: "PENDING_APPROVAL",
    pricingReviewStatus: "PRICING_REVIEW",
    bookingParentType: "ORDER",
    fields: [
        { field: "contact_name", tier: "A" },
        { field: "contact_email", tier: "A" },
        { field: "contact_phone", tier: "A" },
        { field: "venue_contact_name", tier: "A" },
        { field: "venue_contact_email", tier: "A" },
        { field: "venue_contact_phone", tier: "A" },
        { field: "venue_name", tier: "A" },
        { field: "venue_location", tier: "A" },
        { field: "venue_city_id", tier: "A" },
        { field: "special_instructions", tier: "A" },
        { field: "permit_requirements", tier: "A" },
        { field: "is_permanent_placement", tier: "A" },
        { field: "po_number", tier: "A" },
        { field: "job_number", tier: "A", adminOnly: true },
        // Tier C (P3) — event dates drive the booking window via reconcileBookings.
        { field: "event_start_date", tier: "C" },
        { field: "event_end_date", tier: "C" },
    ],
};

// Self-pickup edit config. Tier A descriptive (collector/notes/PO); Tier C = the pickup window
// inputs (pickup_window + expected_return_at) which drive the SP booking window. SP items carry
// NO maintenance fields, so add/remove is simpler than orders (no bundled-SR machinery).
const SELF_PICKUP_EDIT_CONFIG: EntityEditConfig = {
    entityType: "SELF_PICKUP",
    table: selfPickups,
    idColumn: selfPickups.id,
    statusKey: "self_pickup_status",
    financialStatusKey: "financial_status",
    companyKey: "company_id",
    createdByKey: "created_by",
    readableIdKey: "self_pickup_id",
    contactNameKey: "collector_name",
    editableBand: ["SUBMITTED", "PRICING_REVIEW", "PENDING_APPROVAL", "QUOTED"],
    quotedStatus: "QUOTED",
    pendingApprovalStatus: "PENDING_APPROVAL",
    pricingReviewStatus: "PRICING_REVIEW",
    bookingParentType: "SELF_PICKUP",
    fields: [
        { field: "collector_name", tier: "A" },
        { field: "collector_phone", tier: "A" },
        { field: "collector_email", tier: "A" },
        { field: "notes", tier: "A" },
        { field: "special_instructions", tier: "A" },
        { field: "is_permanent_placement", tier: "A" },
        { field: "po_number", tier: "A" },
        { field: "job_number", tier: "A", adminOnly: true },
        // Tier C — the pickup window inputs drive the booking window via reconcileBookings.
        { field: "pickup_window", tier: "C" },
        { field: "expected_return_at", tier: "C" },
    ],
};

/** ORDER + SELF_PICKUP wired. Inbound/SR intentionally excluded (flag-off in prod). */
export const ENTITY_EDIT_CONFIGS: Partial<Record<EditableEntityType, EntityEditConfig>> = {
    ORDER: ORDER_EDIT_CONFIG,
    SELF_PICKUP: SELF_PICKUP_EDIT_CONFIG,
};

/** Wildcard-aware effective-permission check (mirrors requirePermission's matching). */
const userHasPermission = (user: AuthUser, perm: string): boolean => {
    const perms = user.permissions || [];
    if (perms.includes(perm)) return true;
    const [module] = perm.split(":");
    return perms.includes(`${module}:*`);
};

/** Company back-office capability that authorizes editing a colleague's entity. */
const COMPANY_EDIT_PERMISSIONS = ["company:*", "company:manage_quotes"];

/**
 * Derive the edit scope from the user alone (no row needed):
 *   ADMIN                         → "admin"
 *   CLIENT with company-manage    → "company" (covers their own AND colleagues' entities)
 *   CLIENT otherwise              → "owner"  (their own entities only)
 * The route's requirePermission has already proven the base edit capability.
 */
export const resolveEditScope = (user: AuthUser): EditScope => {
    if (user.role === "ADMIN") return "admin";
    if (COMPANY_EDIT_PERMISSIONS.some((p) => userHasPermission(user, p))) return "company";
    return "owner";
};

export type EditContext = {
    entityType: EditableEntityType;
    entityId: string;
    platformId: string;
    config: EntityEditConfig;
    row: Record<string, any>;
    status: string;
    financialStatus: string | null;
    companyId: string | null;
    createdBy: string | null;
    entityIdReadable: string;
};

const getConfig = (entityType: EditableEntityType): EntityEditConfig => {
    const config = ENTITY_EDIT_CONFIGS[entityType];
    if (!config) {
        throw new CustomizedError(
            httpStatus.NOT_IMPLEMENTED,
            `Editing is not yet available for ${entityType}`
        );
    }
    return config;
};

/** Load (and, inside a tx, lock) the entity row and assemble the edit context. */
export const resolveEditContext = async (
    executor: any,
    entityType: EditableEntityType,
    id: string,
    platformId: string,
    forUpdate = true
): Promise<EditContext> => {
    const config = getConfig(entityType);
    const query = executor.select().from(config.table).where(eq(config.idColumn, id));
    const rows = forUpdate ? await query.for("update") : await query;
    const row = rows[0];
    if (!row) {
        throw new CustomizedError(httpStatus.NOT_FOUND, `${entityType} not found`);
    }
    if (row.platform_id && row.platform_id !== platformId) {
        // Cross-platform access is impossible through the platform-scoped routes, but guard anyway.
        throw new CustomizedError(httpStatus.NOT_FOUND, `${entityType} not found`);
    }
    return {
        entityType,
        entityId: id,
        platformId,
        config,
        row,
        status: row[config.statusKey],
        financialStatus: config.financialStatusKey ? row[config.financialStatusKey] : null,
        companyId: row[config.companyKey] ?? null,
        createdBy: row[config.createdByKey] ?? null,
        entityIdReadable: row[config.readableIdKey] ?? id,
    };
};

/** Status-band + row-scope gate. The capability (permission) is proven by the route. */
export const assertEditable = (ctx: EditContext, user: AuthUser, scope: EditScope): void => {
    // 1. Band gate (API-enforced; never UI-only).
    if (!ctx.config.editableBand.includes(ctx.status)) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            `This ${ctx.entityType.toLowerCase().replace("_", " ")} can no longer be edited (status: ${ctx.status})`,
            { code: "EDIT_NOT_EDITABLE" }
        );
    }

    // 2. Scope / ownership.
    if (scope === "admin") {
        if (user.role !== "ADMIN") {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "Admin scope requires an admin account",
                { code: "EDIT_NOT_EDITABLE" }
            );
        }
        return; // platform match already verified in resolveEditContext
    }

    // CLIENT paths (owner | company). Always same-company.
    if (!user.company_id || ctx.companyId !== user.company_id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this record", {
            code: "EDIT_NOT_EDITABLE",
        });
    }
    if (scope === "owner") {
        if (ctx.createdBy !== user.id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "You can only edit your own orders", {
                code: "EDIT_NOT_EDITABLE",
            });
        }
        return;
    }
    // scope === "company": back-office manager editing a colleague's entity.
    const isManager = COMPANY_EDIT_PERMISSIONS.some((p) => userHasPermission(user, p));
    if (!isManager) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this record", {
            code: "EDIT_NOT_EDITABLE",
        });
    }
};

export type ClassifiedPatch = {
    /** Direct column writes for every changed allowlisted field (Tier A descriptive + Tier C date columns). */
    columnWrites: Record<string, unknown>;
    touchedTiers: Set<FieldTier>;
    changed: ChangedField[];
};

/**
 * Filter the patch against the allowlist, drop admin-only fields for non-admin scopes, compute
 * the column-write set and the changed-field diff (vs the loaded row). Every current config field
 * is a direct column, so columnWrites carries all changed fields; the Tier tags drive the
 * downstream side-effects (reprice / reconcile), not whether the column is written.
 */
export const classifyPatch = (
    ctx: EditContext,
    patch: Record<string, unknown>,
    scope: EditScope
): ClassifiedPatch => {
    const allowed = ctx.config.fields.filter((spec) => {
        if (!(spec.field in patch)) return false;
        if (spec.adminOnly && scope !== "admin") return false;
        return true;
    });

    const specsForDiff: ChangedFieldSpec[] = allowed.map((s) => ({ field: s.field, tier: s.tier }));
    const changed = diffChangedFields(ctx.row, patch, specsForDiff);

    const touchedTiers = new Set<FieldTier>(changed.map((c) => c.tier));
    const columnWrites: Record<string, unknown> = {};
    for (const c of changed) {
        columnWrites[c.field] = patch[c.field];
    }

    return { columnWrites, touchedTiers, changed };
};

type OrderItemOp = {
    op?: "UPDATE" | "ADD" | "REMOVE";
    order_item_id?: string;
    asset_id?: string;
    quantity?: number;
    /** ADD-only: client maintenance choice for an ORANGE asset. ORDER only (SP ignores it). */
    maintenance_decision?: "FIX_IN_ORDER" | "USE_AS_IS";
};

/** Extract a Date from a `{ start: string }` window JSONB. Mirrors order.services parseWindowStart
 *  (which is module-private there) — used to set the bundled SR's requested_due_at on an ADD. */
const editParseWindowStart = (windowValue: unknown): Date | null => {
    if (!windowValue || typeof windowValue !== "object") return null;
    const start = (windowValue as { start?: unknown }).start;
    if (typeof start !== "string") return null;
    const parsed = new Date(start);
    return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Apply item edits to an order's physical items (P3b quantity + P3c add/remove). ORDER-only.
 *   UPDATE  — change an existing item's quantity.
 *   ADD     — add a new NON-MAINTENANCE asset (GREEN, or ORANGE used as-is). RED / fix-required
 *             assets are rejected (they need the bundled-SR submit machinery). A duplicate asset
 *             merges into the existing item's quantity.
 *   REMOVE  — drop an item; cancels any non-terminal bundled maintenance SR linked to it. Blocks
 *             removing the last remaining item.
 * Returns a before/after quantity map (keyed by asset name) for the audit trail, or null if
 * nothing changed. reconcileBookings + the reprice cascade from the resulting order_items set.
 */
const applyOrderItemEdits = async (
    tx: any,
    orderId: string,
    platformId: string,
    companyId: string | null,
    ops: OrderItemOp[],
    userId: string
): Promise<{ before: Record<string, number>; after: Record<string, number> } | null> => {
    if (!ops || ops.length === 0) return null;

    const current = await tx
        .select({
            id: orderItems.id,
            asset_id: orderItems.asset_id,
            asset_name: orderItems.asset_name,
            quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.order_id, orderId));
    const byId = new Map<string, any>(current.map((c: any) => [c.id, c] as [string, any]));
    const byAsset = new Map<string, any>(current.map((c: any) => [c.asset_id, c] as [string, any]));

    // Order header fields needed only when an ADD op spins a bundled maintenance SR
    // (FIX_IN_ORDER): the SR's notNull company_id + its requested_due_at window. Loaded once,
    // up front, so the per-op loop can reference it without re-querying.
    const needsOrderHeader = ops.some(
        (o) => (o.op ?? "UPDATE") === "ADD" && o.maintenance_decision === "FIX_IN_ORDER"
    );
    let orderForSr: {
        company_id: string;
        delivery_window: unknown;
        requested_delivery_window: unknown;
    } = { company_id: companyId ?? "", delivery_window: null, requested_delivery_window: null };
    if (needsOrderHeader) {
        const [row] = await tx
            .select({
                company_id: orders.company_id,
                delivery_window: orders.delivery_window,
                requested_delivery_window: orders.requested_delivery_window,
            })
            .from(orders)
            .where(eq(orders.id, orderId));
        if (row) orderForSr = row;
    }

    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    let changed = false;
    let netItemDelta = 0; // +1 per add of a new row, -1 per remove

    for (const op of ops) {
        const kind = op.op ?? "UPDATE";

        if (kind === "UPDATE") {
            const item = byId.get(op.order_item_id!);
            if (!item) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "An item to edit does not belong to this order"
                );
            }
            if (Number(item.quantity) === op.quantity) continue;
            const label = item.asset_name || item.asset_id;
            before[label] = Number(item.quantity);
            after[label] = op.quantity!;
            await tx
                .update(orderItems)
                .set({ quantity: op.quantity })
                .where(eq(orderItems.id, item.id));
            changed = true;
            continue;
        }

        if (kind === "REMOVE") {
            const item = byId.get(op.order_item_id!);
            if (!item) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "An item to remove does not belong to this order"
                );
            }
            const label = item.asset_name || item.asset_id;
            before[label] = Number(item.quantity);
            after[label] = 0;
            // Cancel any non-terminal bundled maintenance SR linked to this item so it stops
            // blocking fulfillment (mirrors cancelOrder's SR cleanup).
            await tx
                .update(serviceRequests)
                .set({
                    request_status: "CANCELLED",
                    cancelled_at: new Date(),
                    cancelled_by: userId,
                    cancellation_reason: "Order item removed during edit",
                    updated_at: new Date(),
                })
                .where(
                    and(
                        eq(serviceRequests.related_order_item_id, item.id),
                        notInArray(serviceRequests.request_status, ["COMPLETED", "CANCELLED"])
                    )
                );
            await tx.delete(orderItems).where(eq(orderItems.id, item.id));
            byId.delete(item.id);
            byAsset.delete(item.asset_id);
            changed = true;
            netItemDelta -= 1;
            continue;
        }

        // kind === "ADD"
        const assetId = op.asset_id!;
        const addQty = op.quantity!;

        // Duplicate asset already on the order → merge into the existing item's quantity.
        const existing = byAsset.get(assetId);
        if (existing) {
            const newQty = Number(existing.quantity) + addQty;
            const label = existing.asset_name || existing.asset_id;
            before[label] = Number(existing.quantity);
            after[label] = newQty;
            await tx
                .update(orderItems)
                .set({ quantity: newQty })
                .where(eq(orderItems.id, existing.id));
            existing.quantity = newQty;
            changed = true;
            continue;
        }

        const [asset] = await tx
            .select({
                id: assets.id,
                name: assets.name,
                company_id: assets.company_id,
                platform_id: assets.platform_id,
                condition: assets.condition,
                status: assets.status,
                deleted_at: assets.deleted_at,
                volume_per_unit: assets.volume_per_unit,
                weight_per_unit: assets.weight_per_unit,
                condition_notes: assets.condition_notes,
                handling_tags: assets.handling_tags,
                refurb_days_estimate: assets.refurb_days_estimate,
            })
            .from(assets)
            .where(eq(assets.id, assetId));

        if (!asset || asset.deleted_at || asset.platform_id !== platformId) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Asset to add was not found");
        }
        if (companyId && asset.company_id && asset.company_id !== companyId) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "Cannot add an asset that belongs to another company",
                { code: "CROSS_COMPANY" }
            );
        }
        if (asset.status === "TRANSFORMED") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Asset cannot be added (${asset.status}): ${asset.name}`,
                { code: "TRANSFORMED_ASSET" }
            );
        }
        // RED still requires the full submit-time gate (a RED asset can NEVER be added as-is) —
        // keep rejecting it. ORANGE now honors the client's maintenance_decision (mirrors the
        // submit/checkout path): FIX_IN_ORDER reserves refurb time + spins a bundled SR, USE_AS_IS
        // (or absent, for back-compat) adds as-is. GREEN is clean.
        if (asset.condition === "RED") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Assets requiring maintenance cannot be added to an existing order yet: ${asset.name}`,
                { code: "MAINTENANCE_ASSET" }
            );
        }

        // Resolve the maintenance decision (ORANGE only). Defaults to USE_AS_IS for back-compat
        // when the client didn't send one.
        const maintenanceDecision: "FIX_IN_ORDER" | "USE_AS_IS" | null =
            asset.condition === "ORANGE" ? (op.maintenance_decision ?? "USE_AS_IS") : null;
        const requiresMaintenance = maintenanceDecision === "FIX_IN_ORDER";

        if (requiresMaintenance && Number(asset.refurb_days_estimate || 0) <= 0) {
            // Same guard as submitOrderFromCart: can't repair-before-event without a refurb
            // estimate to compute the prep window.
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Refurbishment days are required before ORANGE asset can be repaired in an order: ${asset.name}`,
                { code: "MAINTENANCE_ASSET" }
            );
        }

        // Refurb snapshot: capture asset.refurb_days_estimate generally (NOT null), so
        // reconcileBookings derives the correct (longer) prep window. Even a GREEN/USE_AS_IS
        // asset can carry a non-zero refurb estimate — the old hardcoded null under-reserved
        // inventory. computeBookingWindow treats <=0 / null as zero buffer, so this is safe.
        const refurbSnapshot =
            asset.refurb_days_estimate !== null && asset.refurb_days_estimate !== undefined
                ? Number(asset.refurb_days_estimate)
                : null;

        const volPerUnit = parseFloat(asset.volume_per_unit || "0");
        const wtPerUnit = parseFloat(asset.weight_per_unit || "0");
        const [insertedItem] = await tx
            .insert(orderItems)
            .values({
                platform_id: platformId,
                order_id: orderId,
                asset_id: asset.id,
                asset_name: asset.name,
                quantity: addQty,
                volume_per_unit: volPerUnit.toFixed(3),
                weight_per_unit: wtPerUnit.toFixed(2),
                total_volume: (volPerUnit * addQty).toFixed(3),
                total_weight: (wtPerUnit * addQty).toFixed(2),
                condition_notes: asset.condition_notes,
                handling_tags: asset.handling_tags || [],
                from_collection: null,
                maintenance_decision: maintenanceDecision,
                requires_maintenance: requiresMaintenance,
                maintenance_refurb_days_snapshot: refurbSnapshot,
                maintenance_decision_locked_at: maintenanceDecision ? new Date() : null,
            })
            .returning({ id: orderItems.id });

        // FIX_IN_ORDER: create the bundled maintenance SR the same way submitOrderFromCart's
        // Step 6.d does (inline, in-tx) — buildServiceRequestCodes + serviceRequests +
        // serviceRequestItems + serviceRequestStatusHistory. No reusable SR-creation helper
        // exists for the in-tx path (applyMaintenanceDecisionToOrderItem opens its OWN
        // transaction and re-reads the item), so this mirrors the submit pattern directly.
        if (requiresMaintenance) {
            const [srCode] = await buildServiceRequestCodes(platformId, 1);
            const [sr] = await tx
                .insert(serviceRequests)
                .values({
                    service_request_id: srCode,
                    platform_id: platformId,
                    company_id: orderForSr.company_id,
                    request_type: "MAINTENANCE",
                    billing_mode: "INTERNAL_ONLY",
                    link_mode: "BUNDLED_WITH_ORDER",
                    blocks_fulfillment: true,
                    request_status: "SUBMITTED",
                    commercial_status: "INTERNAL",
                    title: `Repair before event — ${asset.name}`,
                    description: asset.condition_notes || null,
                    related_asset_id: asset.id,
                    related_order_id: orderId,
                    related_order_item_id: insertedItem.id,
                    requested_due_at:
                        editParseWindowStart(orderForSr.delivery_window) ||
                        editParseWindowStart(orderForSr.requested_delivery_window),
                    created_by: userId,
                })
                .returning();

            await tx.insert(serviceRequestItems).values({
                service_request_id: sr.id,
                asset_id: asset.id,
                asset_name: asset.name,
                quantity: addQty,
                refurb_days_estimate: refurbSnapshot,
            });

            await tx.insert(serviceRequestStatusHistory).values({
                service_request_id: sr.id,
                platform_id: platformId,
                from_status: null,
                to_status: "SUBMITTED",
                note: "Repair Before Event task auto-created when item was added during order edit",
                changed_by: userId,
            });
        }

        before[asset.name] = 0;
        after[asset.name] = addQty;
        changed = true;
        netItemDelta += 1;
    }

    // Never let an edit empty the order.
    if (netItemDelta < 0) {
        const [{ value: remaining }] = await tx
            .select({ value: count() })
            .from(orderItems)
            .where(eq(orderItems.order_id, orderId));
        if (Number(remaining) === 0) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "An order must keep at least one item",
                { code: "LAST_ITEM" }
            );
        }
    }

    return changed ? { before, after } : null;
};

/**
 * Recompute the order's volume/weight from its (just-updated) items and reprice — re-syncs the
 * volume-based BASE_OPS system line. Mirrors recalculateBaseOps but runs inside the edit tx.
 */
const repriceOrderAfterItemChange = async (
    tx: any,
    orderId: string,
    platformId: string,
    userId: string
): Promise<void> => {
    const [order] = await tx
        .select({ company_id: orders.company_id, calculated_totals: orders.calculated_totals })
        .from(orders)
        .where(eq(orders.id, orderId));
    if (!order) return;

    const [company] = order.company_id
        ? await tx
              .select({ rate: companies.warehouse_ops_rate })
              .from(companies)
              .where(eq(companies.id, order.company_id))
        : [];
    const rate = Number(company?.rate ?? 0);

    const items = await tx
        .select({
            id: orderItems.id,
            quantity: orderItems.quantity,
            asset_id: orderItems.asset_id,
        })
        .from(orderItems)
        .where(eq(orderItems.order_id, orderId));
    const assetIds = items.map((i: any) => i.asset_id);
    const assetRows =
        assetIds.length > 0
            ? await tx
                  .select({
                      id: assets.id,
                      volume_per_unit: assets.volume_per_unit,
                      weight_per_unit: assets.weight_per_unit,
                  })
                  .from(assets)
                  .where(inArray(assets.id, assetIds))
            : [];
    const assetMap = new Map<string, { v: number; w: number }>(
        assetRows.map(
            (a: any) =>
                [a.id, { v: parseFloat(a.volume_per_unit), w: parseFloat(a.weight_per_unit) }] as [
                    string,
                    { v: number; w: number },
                ]
        )
    );

    let totalVolume = 0;
    let totalWeight = 0;
    for (const item of items) {
        const a = assetMap.get(item.asset_id);
        const v = a?.v || 0;
        const w = a?.w || 0;
        totalVolume += v * Number(item.quantity);
        totalWeight += w * Number(item.quantity);
        await tx
            .update(orderItems)
            .set({
                volume_per_unit: v.toFixed(3),
                weight_per_unit: w.toFixed(2),
                total_volume: (v * Number(item.quantity)).toFixed(3),
                total_weight: (w * Number(item.quantity)).toFixed(2),
            })
            .where(eq(orderItems.id, item.id));
    }

    await PricingService.recalculate({
        entity_type: "ORDER",
        entity_id: orderId,
        platform_id: platformId,
        calculated_by: userId,
        base_ops_total_override: rate * totalVolume,
        tx,
    });

    const existing = (order.calculated_totals || {}) as Record<string, unknown>;
    await tx
        .update(orders)
        .set({
            calculated_totals: {
                ...existing,
                volume: totalVolume.toFixed(3),
                weight: totalWeight.toFixed(2),
            },
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));
};

/**
 * Self-pickup item edits (P4) — same UPDATE/ADD/REMOVE op model as orders, but on
 * self_pickup_items, which carry NO maintenance fields. So ADD accepts any non-TRANSFORMED,
 * same-company asset (no RED gate, no bundled SR), and REMOVE just deletes the row (no SR cleanup).
 */
const applySelfPickupItemEdits = async (
    tx: any,
    selfPickupId: string,
    platformId: string,
    companyId: string | null,
    ops: OrderItemOp[]
): Promise<{ before: Record<string, number>; after: Record<string, number> } | null> => {
    if (!ops || ops.length === 0) return null;

    const current = await tx
        .select({
            id: selfPickupItems.id,
            asset_id: selfPickupItems.asset_id,
            asset_name: selfPickupItems.asset_name,
            quantity: selfPickupItems.quantity,
        })
        .from(selfPickupItems)
        .where(eq(selfPickupItems.self_pickup_id, selfPickupId));
    const byId = new Map<string, any>(current.map((c: any) => [c.id, c] as [string, any]));
    const byAsset = new Map<string, any>(current.map((c: any) => [c.asset_id, c] as [string, any]));

    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    let changed = false;
    let netItemDelta = 0;

    for (const op of ops) {
        const kind = op.op ?? "UPDATE";

        if (kind === "UPDATE") {
            const item = byId.get(op.order_item_id!);
            if (!item) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "An item to edit does not belong to this self-pickup"
                );
            }
            if (Number(item.quantity) === op.quantity) continue;
            const label = item.asset_name || item.asset_id;
            before[label] = Number(item.quantity);
            after[label] = op.quantity!;
            await tx
                .update(selfPickupItems)
                .set({ quantity: op.quantity })
                .where(eq(selfPickupItems.id, item.id));
            changed = true;
            continue;
        }

        if (kind === "REMOVE") {
            const item = byId.get(op.order_item_id!);
            if (!item) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "An item to remove does not belong to this self-pickup"
                );
            }
            const label = item.asset_name || item.asset_id;
            before[label] = Number(item.quantity);
            after[label] = 0;
            await tx.delete(selfPickupItems).where(eq(selfPickupItems.id, item.id));
            byId.delete(item.id);
            byAsset.delete(item.asset_id);
            changed = true;
            netItemDelta -= 1;
            continue;
        }

        // kind === "ADD"
        const assetId = op.asset_id!;
        const addQty = op.quantity!;
        const existing = byAsset.get(assetId);
        if (existing) {
            const newQty = Number(existing.quantity) + addQty;
            const label = existing.asset_name || existing.asset_id;
            before[label] = Number(existing.quantity);
            after[label] = newQty;
            await tx
                .update(selfPickupItems)
                .set({ quantity: newQty })
                .where(eq(selfPickupItems.id, existing.id));
            existing.quantity = newQty;
            changed = true;
            continue;
        }

        const [asset] = await tx
            .select({
                id: assets.id,
                name: assets.name,
                company_id: assets.company_id,
                platform_id: assets.platform_id,
                status: assets.status,
                deleted_at: assets.deleted_at,
                volume_per_unit: assets.volume_per_unit,
                weight_per_unit: assets.weight_per_unit,
                condition_notes: assets.condition_notes,
                handling_tags: assets.handling_tags,
            })
            .from(assets)
            .where(eq(assets.id, assetId));

        if (!asset || asset.deleted_at || asset.platform_id !== platformId) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Asset to add was not found");
        }
        if (companyId && asset.company_id && asset.company_id !== companyId) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "Cannot add an asset that belongs to another company",
                { code: "CROSS_COMPANY" }
            );
        }
        if (asset.status === "TRANSFORMED") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Asset cannot be added (${asset.status}): ${asset.name}`,
                { code: "TRANSFORMED_ASSET" }
            );
        }

        const volPerUnit = parseFloat(asset.volume_per_unit || "0");
        const wtPerUnit = parseFloat(asset.weight_per_unit || "0");
        await tx.insert(selfPickupItems).values({
            platform_id: platformId,
            self_pickup_id: selfPickupId,
            asset_id: asset.id,
            asset_name: asset.name,
            quantity: addQty,
            volume_per_unit: volPerUnit.toFixed(3),
            weight_per_unit: wtPerUnit.toFixed(2),
            total_volume: (volPerUnit * addQty).toFixed(3),
            total_weight: (wtPerUnit * addQty).toFixed(2),
            condition_notes: asset.condition_notes,
            handling_tags: asset.handling_tags || [],
            from_collection: null,
        });
        before[asset.name] = 0;
        after[asset.name] = addQty;
        changed = true;
        netItemDelta += 1;
    }

    if (netItemDelta < 0) {
        const [{ value: remaining }] = await tx
            .select({ value: count() })
            .from(selfPickupItems)
            .where(eq(selfPickupItems.self_pickup_id, selfPickupId));
        if (Number(remaining) === 0) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "A self-pickup must keep at least one item",
                { code: "LAST_ITEM" }
            );
        }
    }

    return changed ? { before, after } : null;
};

/** SP volume/weight recompute + reprice — mirrors repriceOrderAfterItemChange on selfPickups. */
const repriceSelfPickupAfterItemChange = async (
    tx: any,
    selfPickupId: string,
    platformId: string,
    userId: string
): Promise<void> => {
    const [pickup] = await tx
        .select({
            company_id: selfPickups.company_id,
            calculated_totals: selfPickups.calculated_totals,
        })
        .from(selfPickups)
        .where(eq(selfPickups.id, selfPickupId));
    if (!pickup) return;

    const [company] = pickup.company_id
        ? await tx
              .select({ rate: companies.warehouse_ops_rate })
              .from(companies)
              .where(eq(companies.id, pickup.company_id))
        : [];
    const rate = Number(company?.rate ?? 0);

    const items = await tx
        .select({
            id: selfPickupItems.id,
            quantity: selfPickupItems.quantity,
            asset_id: selfPickupItems.asset_id,
        })
        .from(selfPickupItems)
        .where(eq(selfPickupItems.self_pickup_id, selfPickupId));
    const assetIds = items.map((i: any) => i.asset_id);
    const assetRows =
        assetIds.length > 0
            ? await tx
                  .select({
                      id: assets.id,
                      volume_per_unit: assets.volume_per_unit,
                      weight_per_unit: assets.weight_per_unit,
                  })
                  .from(assets)
                  .where(inArray(assets.id, assetIds))
            : [];
    const assetMap = new Map<string, { v: number; w: number }>(
        assetRows.map(
            (a: any) =>
                [a.id, { v: parseFloat(a.volume_per_unit), w: parseFloat(a.weight_per_unit) }] as [
                    string,
                    { v: number; w: number },
                ]
        )
    );

    let totalVolume = 0;
    let totalWeight = 0;
    for (const item of items) {
        const a = assetMap.get(item.asset_id);
        const v = a?.v || 0;
        const w = a?.w || 0;
        totalVolume += v * Number(item.quantity);
        totalWeight += w * Number(item.quantity);
        await tx
            .update(selfPickupItems)
            .set({
                volume_per_unit: v.toFixed(3),
                weight_per_unit: w.toFixed(2),
                total_volume: (v * Number(item.quantity)).toFixed(3),
                total_weight: (w * Number(item.quantity)).toFixed(2),
            })
            .where(eq(selfPickupItems.id, item.id));
    }

    await PricingService.recalculate({
        entity_type: "SELF_PICKUP",
        entity_id: selfPickupId,
        platform_id: platformId,
        calculated_by: userId,
        base_ops_total_override: rate * totalVolume,
        tx,
    });

    const existing = (pickup.calculated_totals || {}) as Record<string, unknown>;
    await tx
        .update(selfPickups)
        .set({
            calculated_totals: {
                ...existing,
                volume: totalVolume.toFixed(3),
                weight: totalWeight.toFixed(2),
            },
            updated_at: new Date(),
        })
        .where(eq(selfPickups.id, selfPickupId));
};

export type EditEntityParams = {
    entityType: EditableEntityType;
    entityId: string;
    platformId: string;
    patch: Record<string, unknown>;
    user: AuthUser;
};

export type EditEntityResult = {
    changed_fields: Array<{ field: string; old: unknown; new: unknown }>;
    status: string;
    financial_status: string | null;
    status_reverted: boolean;
};

/**
 * The transactional edit orchestrator. P1: Tier A only. Tier B/C are rejected until the
 * reprice (P2) and reconcile (P3) pipelines are wired.
 */
export const editEntity = async (params: EditEntityParams): Promise<EditEntityResult> => {
    const { entityType, entityId, platformId, patch, user } = params;
    const scope = resolveEditScope(user);

    const result = await db.transaction(async (tx) => {
        const ctx = await resolveEditContext(tx, entityType, entityId, platformId, true);
        assertEditable(ctx, user, scope);

        const { columnWrites, touchedTiers, changed } = classifyPatch(ctx, patch, scope);
        const itemEdits = (patch.items as OrderItemOp[] | undefined) ?? undefined;
        const hasItemEdits = !!itemEdits && itemEdits.length > 0;

        // Tier B (line-item/pricing) edits don't flow through editEntity — line items have their
        // own endpoints + reprice ripple. No config field is Tier B today; guard defensively.
        if (touchedTiers.has("B")) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Pricing edits must go through the line-item endpoints"
            );
        }

        // Tier C (date/window) + item edits are supported for ORDER and SELF_PICKUP only.
        const isSelfPickup = ctx.config.entityType === "SELF_PICKUP";
        if (
            (touchedTiers.has("C") || hasItemEdits) &&
            ctx.config.entityType !== "ORDER" &&
            !isSelfPickup
        ) {
            throw new CustomizedError(
                httpStatus.NOT_IMPLEMENTED,
                "Editing dates/windows or item quantities is not available for this entity"
            );
        }

        // 1. Column writes (Tier A descriptive + Tier C window/date columns).
        if (Object.keys(columnWrites).length > 0) {
            await tx
                .update(ctx.config.table)
                .set(columnWrites)
                .where(eq(ctx.config.idColumn, entityId));
        }

        // 2. Item edits (P3b qty + P3c add/remove) — per-entity items table.
        const itemDiff = hasItemEdits
            ? isSelfPickup
                ? await applySelfPickupItemEdits(
                      tx,
                      entityId,
                      platformId,
                      ctx.companyId,
                      itemEdits!
                  )
                : await applyOrderItemEdits(
                      tx,
                      entityId,
                      platformId,
                      ctx.companyId,
                      itemEdits!,
                      user.id
                  )
            : null;
        const itemsChanged = !!itemDiff;

        if (changed.length === 0 && !itemsChanged) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "No editable changes were provided");
        }

        // 3. Tier C / items: reconcile bookings to the NEW window + quantities. MUST succeed first —
        //    a 409 here rolls the whole edit back (no partial state, no status flip on rejection).
        let reconcileTriggered = false;
        if (touchedTiers.has("C") || itemsChanged) {
            if (isSelfPickup) {
                const newPickupWindow =
                    (patch.pickup_window as { start: string | Date; end: string | Date }) ??
                    (ctx.row.pickup_window as { start: string | Date; end: string | Date });
                const newReturn =
                    "expected_return_at" in patch
                        ? (patch.expected_return_at as Date | string | null)
                        : (ctx.row.expected_return_at as Date | string | null);
                const items = await tx
                    .select({
                        asset_id: selfPickupItems.asset_id,
                        quantity: selfPickupItems.quantity,
                    })
                    .from(selfPickupItems)
                    .where(eq(selfPickupItems.self_pickup_id, entityId));
                await reconcileBookings({
                    tx,
                    parentType: "SELF_PICKUP",
                    parentId: entityId,
                    platformId,
                    companyId: ctx.companyId,
                    desired: items.map((it: any) => ({
                        asset_id: it.asset_id,
                        quantity: Number(it.quantity),
                    })),
                    deriveWindow: () => computeSelfPickupBookingWindow(newPickupWindow, newReturn),
                });
            } else {
                const newStart =
                    (patch.event_start_date as Date) ?? (ctx.row.event_start_date as Date);
                const newEnd = (patch.event_end_date as Date) ?? (ctx.row.event_end_date as Date);
                const items = await tx
                    .select({
                        asset_id: orderItems.asset_id,
                        asset_name: orderItems.asset_name,
                        quantity: orderItems.quantity,
                        refurb: orderItems.maintenance_refurb_days_snapshot,
                        maintenance_decision: orderItems.maintenance_decision,
                    })
                    .from(orderItems)
                    .where(eq(orderItems.order_id, entityId));

                // Maintenance feasibility re-check. Submit/checkout enforces that an
                // event date can't precede the earliest date a FIX_IN_ORDER / RED asset
                // can finish refurb; a Tier-C date pull-forward (or an item change) was
                // previously only availability-checked, so it could silently accept an
                // event that starts before an in-flight refurb completes. Re-run the same
                // earliest-feasible-date math here, INSIDE the tx, so an infeasible edit
                // rolls back. We honor each line's maintenance_refurb_days_snapshot (the
                // refurb commitment frozen at submit — same value the booking window uses
                // via computeBookingWindow) rather than re-reading live asset condition,
                // keeping the window + feasibility decisions consistent.
                const oldStart = ctx.row.event_start_date as Date | null;
                const movedEarlier =
                    !!oldStart && new Date(newStart).getTime() < new Date(oldStart).getTime();
                if (movedEarlier || itemsChanged) {
                    const refurbItems = items.filter(
                        (it: any) =>
                            it.refurb != null &&
                            Number(it.refurb) > 0 &&
                            it.maintenance_decision === "FIX_IN_ORDER"
                    );
                    if (refurbItems.length > 0) {
                        const cfg = await getPlatformFeasibilityConfig(platformId, ctx.companyId);
                        const leadWindowStart = new Date(
                            Date.now() + cfg.minimum_lead_hours * 60 * 60 * 1000
                        );
                        const newStartTime = new Date(newStart).getTime();
                        for (const it of refurbItems) {
                            const refurbDays = Number(it.refurb);
                            const readyDate = addBusinessDays(leadWindowStart, refurbDays, cfg);
                            if (newStartTime < readyDate.getTime()) {
                                const earliest = formatDateInTimezone(readyDate, cfg.timezone);
                                throw new CustomizedError(
                                    httpStatus.CONFLICT,
                                    `${it.asset_name}: cannot be repaired in time for the new event date (earliest feasible ${earliest})`,
                                    {
                                        code: "INFEASIBLE_REFURB",
                                        asset_id: it.asset_id,
                                        asset_name: it.asset_name,
                                        refurb_days_estimate: refurbDays,
                                        earliest_feasible_date: earliest,
                                        earliest_feasible_datetime: readyDate.toISOString(),
                                    }
                                );
                            }
                        }
                    }
                }
                await reconcileBookings({
                    tx,
                    parentType: "ORDER",
                    parentId: entityId,
                    platformId,
                    companyId: ctx.companyId,
                    desired: items.map((it: any) => ({
                        asset_id: it.asset_id,
                        quantity: Number(it.quantity),
                        refurb_days: it.refurb ?? 0,
                    })),
                    deriveWindow: (line) =>
                        computeBookingWindow(newStart, newEnd, line.refurb_days),
                });
            }
            reconcileTriggered = true;
        }

        // 4. Reprice on an item change (volume → BASE_OPS). recalculate accepts the tx.
        if (itemsChanged) {
            if (isSelfPickup) {
                await repriceSelfPickupAfterItemChange(tx, entityId, platformId, user.id);
            } else {
                await repriceOrderAfterItemChange(tx, entityId, platformId, user.id);
            }
        }

        // 5. Edited-quote revert (OQ10): a Tier C / item edit on a QUOTED entity invalidates the
        //    quote — bounce it back for re-review. ORDER → PRICING_REVIEW + QUOTE_REVISED. SELF_PICKUP
        //    → PRICING_REVIEW only; SP financial_status is left untouched (OQ7: it's effectively
        //    static PENDING_QUOTE in prod — we don't introduce QUOTE_REVISED there).
        let statusReverted = false;
        if ((touchedTiers.has("C") || itemsChanged) && ctx.status === ctx.config.quotedStatus) {
            if (isSelfPickup) {
                await tx
                    .update(selfPickups)
                    .set({ self_pickup_status: "PRICING_REVIEW", updated_at: new Date() })
                    .where(eq(selfPickups.id, entityId));
                await tx.insert(selfPickupStatusHistory).values({
                    platform_id: platformId,
                    self_pickup_id: entityId,
                    status: "PRICING_REVIEW",
                    notes: "Self-pickup edited after the quote was sent — returned for re-review.",
                    updated_by: user.id,
                });
            } else {
                await tx
                    .update(orders)
                    .set({
                        order_status: "PRICING_REVIEW",
                        financial_status: "QUOTE_REVISED",
                        updated_at: new Date(),
                    })
                    .where(eq(orders.id, entityId));
                await tx.insert(orderStatusHistory).values({
                    platform_id: platformId,
                    order_id: entityId,
                    status: "PRICING_REVIEW",
                    notes: "Order edited after the quote was sent — returned to pricing review for re-approval.",
                    updated_by: user.id,
                });
                await tx.insert(financialStatusHistory).values({
                    platform_id: platformId,
                    order_id: entityId,
                    status: "QUOTE_REVISED",
                    notes: "Quote revised after a post-quote edit.",
                    updated_by: user.id,
                });
            }
            statusReverted = true;
        }

        // Record item-quantity changes in the audit trail (synthetic field entry).
        if (itemDiff) {
            changed.push({
                field: "item_quantities",
                old: itemDiff.before,
                new: itemDiff.after,
                tier: "C",
            });
        }

        // Attribution for a manager editing a colleague's entity.
        let actedByName: string | null = null;
        let onBehalfOfName: string | null = null;
        if (scope === "company" && ctx.createdBy && ctx.createdBy !== user.id) {
            actedByName = user.name;
            const [creator] = await tx
                .select({ name: users.name })
                .from(users)
                .where(eq(users.id, ctx.createdBy));
            onBehalfOfName = creator?.name || "a colleague";
        }

        await writeChangeHistory(tx, {
            platformId,
            entityType: ctx.config.entityType,
            entityId,
            entityIdReadable: ctx.entityIdReadable,
            changed,
            actorId: user.id,
            actorRole: user.role,
            actedByName,
            onBehalfOfName,
        });

        return {
            ctx,
            columnWrites,
            changed,
            actedByName,
            onBehalfOfName,
            statusReverted,
            reconcileTriggered,
            repriceTriggered: itemsChanged,
        };
    });

    // After commit: emit the `*.updated` event (audit + rule-driven notifications).
    const {
        ctx,
        columnWrites,
        changed,
        actedByName,
        onBehalfOfName,
        statusReverted,
        reconcileTriggered,
        repriceTriggered,
    } = result;
    const eventType = ENTITY_UPDATED_EVENT_FOR[ctx.config.entityType];
    if (eventType) {
        let companyName = "N/A";
        if (ctx.companyId) {
            const [company] = await db
                .select({ name: companies.name })
                .from(companies)
                .where(eq(companies.id, ctx.companyId));
            companyName = company?.name || "N/A";
        }
        await eventBus.emit({
            platform_id: platformId,
            event_type: eventType,
            entity_type: ctx.config.entityType,
            entity_id: entityId,
            actor_id: user.id,
            actor_role: user.role,
            payload: buildEntityUpdatedPayload({
                entityIdReadable: ctx.entityIdReadable,
                companyId: ctx.companyId || "",
                companyName,
                // Prefer the freshly-written contact name over the pre-edit snapshot in
                // ctx.row — an edit that changed the contact name would otherwise notify
                // with the stale value. columnWrites holds the new column values.
                contactName: ctx.config.contactNameKey
                    ? ((columnWrites[ctx.config.contactNameKey] as string | null | undefined) ??
                      (ctx.row[ctx.config.contactNameKey] as string | null))
                    : null,
                changed,
                statusReverted,
                reconcileTriggered,
                repriceTriggered,
                actedByName,
                onBehalfOfName,
            }),
        });
    }

    // SP keeps its financial_status on a revert (OQ7); only ORDER moves to QUOTE_REVISED.
    const revertedFinancial =
        statusReverted && ctx.config.entityType !== "SELF_PICKUP"
            ? "QUOTE_REVISED"
            : ctx.financialStatus;
    return {
        changed_fields: changed.map((c) => ({ field: c.field, old: c.old, new: c.new })),
        status: statusReverted ? "PRICING_REVIEW" : ctx.status,
        financial_status: revertedFinancial,
        status_reverted: statusReverted,
    };
};

export const EntityEditService = {
    ENTITY_EDIT_CONFIGS,
    resolveEditScope,
    resolveEditContext,
    assertEditable,
    classifyPatch,
    editEntity,
};
