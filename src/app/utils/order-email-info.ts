import { eventRange, formatWindow } from "../events/templates/base";

/**
 * Canonical order-email info block + builder.
 *
 * Today every order email emit site (~11 in order.services.ts + 2 in
 * scanning.services.ts) hand-rolls its own payload and every order template
 * open-codes its own infoRow stack, which has drifted badly (event dates
 * formatted 3 ways, venue 4 ways, window labels 3 ways, fields present in some
 * emails and missing in others). This module is the single place that assembles
 * a standardized, pre-formatted order-info block from the order row, so every
 * order email carries IDENTICAL, consistently-formatted order facts.
 *
 * SNAPSHOT SEMANTICS: built EMIT-SIDE and embedded in the event payload (which
 * the notification worker re-reads frozen at send time) — no DB re-fetch in the
 * hot send path, preserving the system's frozen-snapshot model.
 *
 * CLIENT-VISIBILITY: OrderInfoBlock CONTAINS NO MONEY. Pricing stays a separate,
 * CLIENT-projected payload field, so margin/buy/cost can NEVER leak through this
 * block — a structural guarantee, not emit-site discipline.
 *
 * FOUR-ENTITY: shaped so self-pickup / inbound / service-request adapters can be
 * added later (own build* fn → same block shape → same `orderInfoRows` partial)
 * without a rewrite. Orders-only for now.
 */

/** {start, end} datetime JSONB shape stored on delivery/pickup windows. */
type Window = { start?: string; end?: string } | null | undefined;

/** Structural subset of an order row the builder reads. Relational labels
 *  (company name, venue city name) + the item count are passed by the caller. */
export type OrderInfoInput = {
    order_id: string;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    venue_name?: string | null;
    venue_location?:
        | { country?: string; city?: string; address?: string; access_notes?: string }
        | null;
    venue_contact_name?: string | null;
    venue_contact_email?: string | null;
    venue_contact_phone?: string | null;
    event_start_date?: Date | string | null;
    event_end_date?: Date | string | null;
    delivery_window?: Window;
    requested_delivery_window?: Window;
    pickup_window?: Window;
    requested_pickup_window?: Window;
    po_number?: string | null;
    job_number?: string | null;
    special_instructions?: string | null;
    is_permanent_placement?: boolean | null;
    calculated_totals?: { volume?: number | string | null } | null;
};

/**
 * The canonical order-info block embedded under `payload.order_info` in every
 * order event. Every field is "present-when-set": omitted when empty, so a
 * SUBMIT email naturally lacks PO/confirmed-window while a later CONFIRMED/QUOTE
 * email shows them — with zero per-template conditional logic. NO money fields.
 */
export type OrderInfoBlock = {
    entity_id_readable: string;
    company_name: string;
    contact?: string;
    contact_phone?: string;
    venue?: string;
    venue_address?: string;
    venue_access?: string;
    venue_contact?: string;
    event?: string;
    delivery_window?: string;
    pickup_window?: string;
    items?: string;
    po_number?: string;
    job_number?: string;
    special_instructions?: string;
    placement?: string;
};

const clean = (s?: string | null): string | undefined =>
    typeof s === "string" && s.trim() ? s.trim() : undefined;

/** "Name (detail)" / "Name" / "detail" — for combined contact rows. */
const combineContact = (name?: string | null, detail?: string | null): string | undefined => {
    const n = clean(name);
    const d = clean(detail);
    if (n && d) return `${n} (${d})`;
    return n ?? d;
};

export function buildOrderInfoBlock(
    order: OrderInfoInput,
    opts: { companyName?: string | null; venueCityName?: string | null; itemCount?: number | null }
): OrderInfoBlock {
    const block: OrderInfoBlock = {
        entity_id_readable: order.order_id,
        company_name: clean(opts.companyName) ?? "N/A",
    };

    // Contact — "name (email)" + phone
    const contact = combineContact(order.contact_name, order.contact_email);
    if (contact) block.contact = contact;
    if (clean(order.contact_phone)) block.contact_phone = clean(order.contact_phone);

    // Venue — "name, city" (+ address / access from venue_location)
    const vName = clean(order.venue_name);
    const vCity = clean(opts.venueCityName) ?? clean(order.venue_location?.city);
    if (vName) block.venue = vCity ? `${vName}, ${vCity}` : vName;
    if (clean(order.venue_location?.address)) block.venue_address = clean(order.venue_location?.address);
    if (clean(order.venue_location?.access_notes))
        block.venue_access = clean(order.venue_location?.access_notes);

    // On-site venue contact — "name (phone or email)"
    const venueContact = combineContact(
        order.venue_contact_name,
        clean(order.venue_contact_phone) ?? order.venue_contact_email
    );
    if (venueContact) block.venue_contact = venueContact;

    // Event — DATE ONLY range
    const event = eventRange(order.event_start_date, order.event_end_date);
    if (event) block.event = event;

    // Windows — authoritative ?? requested, DATE + TIME
    const delivery = formatWindow(order.delivery_window ?? order.requested_delivery_window);
    if (delivery) block.delivery_window = delivery;
    const pickup = formatWindow(order.pickup_window ?? order.requested_pickup_window);
    if (pickup) block.pickup_window = pickup;

    // Items — "N item(s), X m³"
    const count = opts.itemCount;
    if (count != null && count > 0) {
        const vol = order.calculated_totals?.volume;
        const volStr = vol != null && vol !== "" ? `, ${Number(vol).toFixed(2)} m³` : "";
        block.items = `${count} item${count === 1 ? "" : "s"}${volStr}`;
    }

    // Later-added / optional fields (present-when-set)
    if (clean(order.po_number)) block.po_number = clean(order.po_number);
    if (clean(order.job_number)) block.job_number = clean(order.job_number);
    if (clean(order.special_instructions))
        block.special_instructions = clean(order.special_instructions);
    if (order.is_permanent_placement) block.placement = "Permanent placement";

    return block;
}
