/**
 * CLIENT CHANGELOG ALLOWLIST ENGINE
 * =================================
 *
 * The single registry that decides which entity_change_history field keys a
 * CLIENT is ever allowed to see — in the in-app changelog API projection AND in
 * the `*.updated` client email diff.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DEFAULT-DENY. Adding a key to this map is a PRODUCT DECISION — absence is │
 * │  the safe default. A field NOT listed here NEVER renders to a CLIENT, no   │
 * │  matter where it comes from. This is deliberately an allowlist (not a      │
 * │  denylist) so a new change-tracked field (a new pricing action, a new      │
 * │  internal ops field, a future margin/rate audit row) is hidden from        │
 * │  clients until someone consciously decides it is client-safe and adds it   │
 * │  here with a client-facing label.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Scope of what IS allowed (owner interview 2026-07-07, feedback item 16):
 *   1. Event dates & windows       — when the job happens / when items move.
 *   2. Venue & contacts            — where it happens + who to reach.
 *   3. Items & quantities          — WHAT + HOW MANY (names + qty only; the
 *                                    diff value must NEVER carry rates/prices).
 *   4. Client-own fields           — the client's own inputs: PO number,
 *                                    special instructions, permit answers.
 *
 * Explicitly NOT allowed (partial, illustrative — the allowlist is the truth):
 *   - job_number            (internal ops reference, adminOnly edit field)
 *   - bulk_margin           (pricing action audit row)
 *   - pricing_mode          (no-cost / pricing state change)
 *   - anything margin / buy-price / sell-rate related
 *
 * Field keys mirror the `field` column written by writeChangeHistory (which
 * mirrors the ENTITY_EDIT_CONFIGS field specs in entity-edit.service.ts + the
 * synthetic `item_quantities` row). Order + self-pickup keys are unified here
 * (the two entities share this registry; a key present for either is fine —
 * the other entity simply never emits it).
 */

export const CLIENT_CHANGELOG_FIELD_LABELS: Record<string, string> = {
    // ── 1. Event dates & windows ────────────────────────────────────────────
    event_start_date: "Event start date",
    event_end_date: "Event end date",
    delivery_window: "Delivery window",
    requested_delivery_window: "Requested delivery window",
    pickup_window: "Pickup window",
    expected_return_at: "Expected return",

    // ── 2. Venue & contacts ─────────────────────────────────────────────────
    venue_name: "Venue",
    venue_location: "Venue address",
    venue_city_id: "Venue city",
    venue_contact_name: "Venue contact name",
    venue_contact_email: "Venue contact email",
    venue_contact_phone: "Venue contact phone",
    contact_name: "Contact name",
    contact_email: "Contact email",
    contact_phone: "Contact phone",
    // Self-pickup collector = the client-side contact for a self-pickup.
    collector_name: "Collector name",
    collector_email: "Collector email",
    collector_phone: "Collector phone",

    // ── 3. Items & quantities ───────────────────────────────────────────────
    // Synthetic row written by the edit service. Value carries item NAMES + QTY
    // only — never rates/prices (enforced at the diff source, not here).
    item_quantities: "Items",

    // ── 4. Client-own fields ────────────────────────────────────────────────
    po_number: "PO number",
    special_instructions: "Special instructions",
    permit_requirements: "Permit details",
    notes: "Notes",
    // Whether items stay permanently vs are returned — a client-facing order
    // attribute the client themselves sets; carries no pricing exposure.
    is_permanent_placement: "Permanent placement",
};

/** True when a change-history field key is client-safe (present in the allowlist). */
export const isClientVisibleChangeField = (field: string): boolean =>
    Object.prototype.hasOwnProperty.call(CLIENT_CHANGELOG_FIELD_LABELS, field);

/** Client-facing label for a field key, or undefined if it is not client-visible. */
export const clientChangelogFieldLabel = (field: string): string | undefined =>
    CLIENT_CHANGELOG_FIELD_LABELS[field];

/**
 * Drop every change-history row whose field is not on the allowlist. Applied to
 * the CLIENT projection of order/self-pickup change history AND (conceptually)
 * the client email diff. A row per field means filtering here makes an entire
 * disallowed action (e.g. a bulk_margin or pricing_mode row) vanish for clients.
 */
export const filterClientChangeRows = <T extends { field: string }>(rows: T[]): T[] =>
    rows.filter((row) => isClientVisibleChangeField(row.field));
