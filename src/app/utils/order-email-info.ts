import { eventRange, formatWindow } from "../events/templates/base";

/**
 * Canonical order-email info block + builder.
 *
 * Today every order email emit site (~13 across order.services.ts +
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
 *
 * JSONB columns (venue_location / windows / calculated_totals) are typed `unknown`
 * here because that is what Drizzle returns; they are narrowed safely below. This
 * lets every emit site pass its order row directly with no casting.
 */

/** Structural subset of an order row the builder reads. Relational labels
 *  (company name, venue city name) + the item count are passed by the caller. */
export type OrderInfoInput = {
    order_id: string;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    venue_name?: string | null;
    venue_location?: unknown;
    venue_contact_name?: string | null;
    venue_contact_email?: string | null;
    venue_contact_phone?: string | null;
    event_start_date?: Date | string | null;
    event_end_date?: Date | string | null;
    delivery_window?: unknown;
    requested_delivery_window?: unknown;
    pickup_window?: unknown;
    requested_pickup_window?: unknown;
    po_number?: string | null;
    job_number?: string | null;
    special_instructions?: string | null;
    is_permanent_placement?: boolean | null;
    calculated_totals?: unknown;
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

/** Trimmed non-empty string, or undefined — accepts unknown (jsonb fields). */
const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Narrow a jsonb value to a plain object (or undefined). */
const obj = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;

/** Narrow a jsonb value to a {start,end} window shape for formatWindow. */
const asWindow = (v: unknown): { start?: string; end?: string } | undefined => {
    const o = obj(v);
    if (!o) return undefined;
    return { start: str(o.start), end: str(o.end) };
};

/** "Name (detail)" / "Name" / "detail" — for combined contact rows. */
const combineContact = (name: unknown, detail: unknown): string | undefined => {
    const n = str(name);
    const d = str(detail);
    if (n && d) return `${n} (${d})`;
    return n ?? d;
};

export function buildOrderInfoBlock(
    order: OrderInfoInput,
    opts: { companyName?: string | null; venueCityName?: string | null; itemCount?: number | null }
): OrderInfoBlock {
    const block: OrderInfoBlock = {
        entity_id_readable: order.order_id,
        company_name: str(opts.companyName) ?? "N/A",
    };

    // Contact — "name (email)" + phone
    const contact = combineContact(order.contact_name, order.contact_email);
    if (contact) block.contact = contact;
    if (str(order.contact_phone)) block.contact_phone = str(order.contact_phone);

    // Venue — "name, city" (+ address / access from venue_location)
    const loc = obj(order.venue_location);
    const vName = str(order.venue_name);
    const vCity = str(opts.venueCityName) ?? str(loc?.city);
    if (vName) block.venue = vCity ? `${vName}, ${vCity}` : vName;
    if (str(loc?.address)) block.venue_address = str(loc?.address);
    if (str(loc?.access_notes)) block.venue_access = str(loc?.access_notes);

    // On-site venue contact — "name (phone or email)"
    const venueContact = combineContact(
        order.venue_contact_name,
        str(order.venue_contact_phone) ?? order.venue_contact_email
    );
    if (venueContact) block.venue_contact = venueContact;

    // Event — DATE ONLY range. Permanent placements carry a far-future sentinel
    // event_end (no return), so render start-only instead of "– Thu, 31 Dec 2099";
    // the Placement row communicates the no-return nature.
    const event = order.is_permanent_placement
        ? eventRange(order.event_start_date, null)
        : eventRange(order.event_start_date, order.event_end_date);
    if (event) block.event = event;

    // Windows — authoritative ?? requested, DATE + TIME
    const delivery = formatWindow(
        asWindow(order.delivery_window) ?? asWindow(order.requested_delivery_window)
    );
    if (delivery) block.delivery_window = delivery;
    const pickup = formatWindow(
        asWindow(order.pickup_window) ?? asWindow(order.requested_pickup_window)
    );
    if (pickup) block.pickup_window = pickup;

    // Items — "N item(s), X m³"
    const count = opts.itemCount;
    if (count != null && count > 0) {
        const vol = obj(order.calculated_totals)?.volume;
        const volStr =
            vol != null && vol !== "" ? `, ${Number(vol as number | string).toFixed(2)} m³` : "";
        block.items = `${count} item${count === 1 ? "" : "s"}${volStr}`;
    }

    // Later-added / optional fields (present-when-set)
    if (str(order.po_number)) block.po_number = str(order.po_number);
    if (str(order.job_number)) block.job_number = str(order.job_number);
    if (str(order.special_instructions))
        block.special_instructions = str(order.special_instructions);
    if (order.is_permanent_placement) block.placement = "Permanent placement";

    return block;
}
