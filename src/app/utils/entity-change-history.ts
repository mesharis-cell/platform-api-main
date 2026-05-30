/**
 * Entity-edit audit helpers — shared across the four-entity edit pattern (orders,
 * inbound_requests, service_requests, self_pickups).
 *
 * - `diffChangedFields` produces a deep-equal, empty-normalized diff over an allowlist.
 * - `writeChangeHistory` persists one `entity_change_history` row per changed field, INSIDE
 *   the edit transaction (so a rolled-back edit drops its audit rows too).
 * - `buildEntityUpdatedPayload` assembles the `*.updated` event payload.
 * - `ENTITY_UPDATED_EVENT_FOR` maps an entity type to its `*.updated` event key.
 *
 * Deliberately takes the field allowlist as a parameter (does NOT import the edit-config
 * registry) to avoid an import cycle with `entity-edit.service.ts`.
 */
import { entityChangeHistory } from "../../db/schema";
import { EVENT_TYPES, type EntityType } from "../events/event-types";

export type FieldTier = "A" | "B" | "C";

export type ChangedFieldSpec = { field: string; tier: FieldTier };

export type ChangedField = { field: string; old: unknown; new: unknown; tier: FieldTier };

/** entity_type → its `*.updated` event key. */
export const ENTITY_UPDATED_EVENT_FOR: Partial<Record<EntityType, string>> = {
    ORDER: EVENT_TYPES.ORDER_UPDATED,
    INBOUND_REQUEST: EVENT_TYPES.INBOUND_REQUEST_UPDATED,
    SERVICE_REQUEST: EVENT_TYPES.SERVICE_REQUEST_UPDATED,
    SELF_PICKUP: EVENT_TYPES.SELF_PICKUP_UPDATED,
};

const isUnchanged = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    // Treat null / undefined / "" as the same "absent" value so e.g. "" → null is not a change.
    const aEmpty = a === null || a === undefined || a === "";
    const bEmpty = b === null || b === undefined || b === "";
    if (aEmpty && bEmpty) return true;
    if (aEmpty !== bEmpty) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
};

/**
 * Diff `after` against `before` over the allowlisted field specs. One ChangedField per field
 * present in `after` whose value actually changed (deep-equal, empty-normalized).
 */
export const diffChangedFields = (
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    specs: ChangedFieldSpec[]
): ChangedField[] => {
    const changed: ChangedField[] = [];
    for (const spec of specs) {
        if (!(spec.field in after)) continue; // field not part of this patch
        const oldVal = before[spec.field] ?? null;
        const newVal = after[spec.field] ?? null;
        if (isUnchanged(oldVal, newVal)) continue;
        changed.push({ field: spec.field, old: oldVal, new: newVal, tier: spec.tier });
    }
    return changed;
};

export type WriteChangeHistoryParams = {
    platformId: string;
    entityType: EntityType;
    entityId: string;
    entityIdReadable?: string | null;
    changed: ChangedField[];
    actorId: string;
    actorRole?: string | null;
    actedByName?: string | null;
    onBehalfOfName?: string | null;
};

/**
 * Insert one `entity_change_history` row per changed field. MUST run inside the edit tx.
 * No-op when nothing changed.
 */
export const writeChangeHistory = async (
    tx: any,
    params: WriteChangeHistoryParams
): Promise<void> => {
    if (params.changed.length === 0) return;
    await tx.insert(entityChangeHistory).values(
        params.changed.map((c) => ({
            platform_id: params.platformId,
            entity_type: params.entityType,
            entity_id: params.entityId,
            entity_id_readable: params.entityIdReadable ?? null,
            field: c.field,
            old_value: c.old ?? null,
            new_value: c.new ?? null,
            change_tier: c.tier,
            changed_by: params.actorId,
            changed_by_role: params.actorRole ?? null,
            acted_by_name: params.actedByName ?? null,
            on_behalf_of_name: params.onBehalfOfName ?? null,
        }))
    );
};

export type BuildUpdatedPayloadParams = {
    entityIdReadable: string;
    companyId: string;
    companyName: string;
    contactName?: string | null;
    changed: ChangedField[];
    statusReverted?: boolean;
    repriceTriggered?: boolean;
    reconcileTriggered?: boolean;
    actedByName?: string | null;
    onBehalfOfName?: string | null;
};

/**
 * Assemble the EntityUpdatedPayload for eventBus.emit. Strips the internal `tier` from the
 * client/admin-visible changed_fields. The `*_url` slots are filled by the handler's
 * injectDeepLink based on entity_type.
 */
export const buildEntityUpdatedPayload = (
    p: BuildUpdatedPayloadParams
): Record<string, unknown> => ({
    entity_id_readable: p.entityIdReadable,
    company_id: p.companyId,
    company_name: p.companyName,
    contact_name: p.contactName ?? undefined,
    changed_fields: p.changed.map((c) => ({ field: c.field, old: c.old, new: c.new })),
    status_reverted: p.statusReverted ?? false,
    reprice_triggered: p.repriceTriggered ?? false,
    reconcile_triggered: p.reconcileTriggered ?? false,
    acted_by_name: p.actedByName ?? undefined,
    on_behalf_of_name: p.onBehalfOfName ?? undefined,
    order_url: "",
    request_url: "",
    self_pickup_url: "",
});
