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
    serviceRequests,
    users,
} from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";
import { EntityType } from "../events/event-types";
import { eventBus } from "../events/event-bus";
import { computeBookingWindow, reconcileBookings } from "../modules/order/order.utils";
import { PricingService } from "./pricing.service";
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

/** ORDER wired in P1; the other three configs are added in P4. */
export const ENTITY_EDIT_CONFIGS: Partial<Record<EditableEntityType, EntityEditConfig>> = {
    ORDER: ORDER_EDIT_CONFIG,
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
            `This ${ctx.entityType.toLowerCase().replace("_", " ")} can no longer be edited (status: ${ctx.status})`
        );
    }

    // 2. Scope / ownership.
    if (scope === "admin") {
        if (user.role !== "ADMIN") {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "Admin scope requires an admin account"
            );
        }
        return; // platform match already verified in resolveEditContext
    }

    // CLIENT paths (owner | company). Always same-company.
    if (!user.company_id || ctx.companyId !== user.company_id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this record");
    }
    if (scope === "owner") {
        if (ctx.createdBy !== user.id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "You can only edit your own orders");
        }
        return;
    }
    // scope === "company": back-office manager editing a colleague's entity.
    const isManager = COMPANY_EDIT_PERMISSIONS.some((p) => userHasPermission(user, p));
    if (!isManager) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this record");
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
            })
            .from(assets)
            .where(eq(assets.id, assetId));

        if (!asset || asset.deleted_at || asset.platform_id !== platformId) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Asset to add was not found");
        }
        if (companyId && asset.company_id && asset.company_id !== companyId) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "Cannot add an asset that belongs to another company"
            );
        }
        if (asset.status === "TRANSFORMED") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Asset cannot be added (${asset.status}): ${asset.name}`
            );
        }
        // Maintenance-requiring assets need the submit-time bundled-SR machinery — not supported
        // on edit yet. RED always requires it; ORANGE is added "as-is" (no fix). GREEN is clean.
        if (asset.condition === "RED") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Assets requiring maintenance cannot be added to an existing order yet: ${asset.name}`
            );
        }
        const maintenanceDecision = asset.condition === "ORANGE" ? "USE_AS_IS" : null;

        const volPerUnit = parseFloat(asset.volume_per_unit || "0");
        const wtPerUnit = parseFloat(asset.weight_per_unit || "0");
        await tx.insert(orderItems).values({
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
            requires_maintenance: false,
            maintenance_refurb_days_snapshot: null,
            maintenance_decision_locked_at: maintenanceDecision ? new Date() : null,
        });
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
                "An order must keep at least one item"
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

        // Tier C (event dates) + item-quantity edits are ORDER-only until P4 generalizes them.
        if ((touchedTiers.has("C") || hasItemEdits) && ctx.config.entityType !== "ORDER") {
            throw new CustomizedError(
                httpStatus.NOT_IMPLEMENTED,
                "Editing event dates or item quantities is not yet available for this entity"
            );
        }

        // 1. Column writes (Tier A descriptive + Tier C event-date columns).
        if (Object.keys(columnWrites).length > 0) {
            await tx
                .update(ctx.config.table)
                .set(columnWrites)
                .where(eq(ctx.config.idColumn, entityId));
        }

        // 2. Item quantity edits (P3b) — update existing order_items.
        const itemDiff = hasItemEdits
            ? await applyOrderItemEdits(
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
            const newStart = (patch.event_start_date as Date) ?? (ctx.row.event_start_date as Date);
            const newEnd = (patch.event_end_date as Date) ?? (ctx.row.event_end_date as Date);
            const items = await tx
                .select({
                    asset_id: orderItems.asset_id,
                    quantity: orderItems.quantity,
                    refurb: orderItems.maintenance_refurb_days_snapshot,
                })
                .from(orderItems)
                .where(eq(orderItems.order_id, entityId));
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
                deriveWindow: (line) => computeBookingWindow(newStart, newEnd, line.refurb_days),
            });
            reconcileTriggered = true;
        }

        // 4. Reprice on a quantity change (volume → BASE_OPS). recalculate accepts the tx.
        if (itemsChanged) {
            await repriceOrderAfterItemChange(tx, entityId, platformId, user.id);
        }

        // 5. Edited-quote revert (OQ10): a Tier C / item edit on a QUOTED order invalidates the
        //    quote — bounce it to PRICING_REVIEW + QUOTE_REVISED so admin/logistics re-review.
        //    Pre-quote states just keep the reconciled bookings. ORDER-only history (P4 generalizes).
        let statusReverted = false;
        if ((touchedTiers.has("C") || itemsChanged) && ctx.status === ctx.config.quotedStatus) {
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
                contactName: ctx.config.contactNameKey
                    ? (ctx.row[ctx.config.contactNameKey] as string | null)
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

    return {
        changed_fields: changed.map((c) => ({ field: c.field, old: c.old, new: c.new })),
        status: statusReverted ? "PRICING_REVIEW" : ctx.status,
        financial_status: statusReverted ? "QUOTE_REVISED" : ctx.financialStatus,
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
