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
import { eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import { companies, orders, users } from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";
import { EntityType } from "../events/event-types";
import { eventBus } from "../events/event-bus";
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
    tierAWrites: Record<string, unknown>;
    touchedTiers: Set<FieldTier>;
    changed: ChangedField[];
};

/**
 * Filter the patch against the allowlist, drop admin-only fields for non-admin scopes, compute
 * the Tier-A write set and the changed-field diff (vs the loaded row).
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
    const tierAWrites: Record<string, unknown> = {};
    for (const c of changed) {
        if (c.tier === "A") tierAWrites[c.field] = patch[c.field];
    }

    return { tierAWrites, touchedTiers, changed };
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

        const { tierAWrites, touchedTiers, changed } = classifyPatch(ctx, patch, scope);

        if (changed.length === 0) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "No editable changes were provided");
        }

        // P1 guard: pricing/inventory edits are not yet supported (P2 = Tier B, P3 = Tier C).
        if (touchedTiers.has("B") || touchedTiers.has("C")) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Editing pricing or inventory fields is not yet available"
            );
        }

        // Tier A write.
        if (Object.keys(tierAWrites).length > 0) {
            await tx
                .update(ctx.config.table)
                .set(tierAWrites)
                .where(eq(ctx.config.idColumn, entityId));
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
            statusReverted: false, // P2 sets this on the Tier B/C revert
        };
    });

    // After commit: emit the `*.updated` event (audit + rule-driven notifications).
    const { ctx, changed, actedByName, onBehalfOfName, statusReverted } = result;
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
                actedByName,
                onBehalfOfName,
            }),
        });
    }

    return {
        changed_fields: changed.map((c) => ({ field: c.field, old: c.old, new: c.new })),
        status: ctx.status,
        financial_status: ctx.financialStatus,
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
