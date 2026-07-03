import { infoRow } from "./base";
import type { OrderInfoBlock } from "../../utils/order-email-info";

/**
 * Render the canonical order-info block as a uniform infoRow stack.
 *
 * Present-when-set: only rows whose value exists are rendered, so the SAME
 * partial serves every order email (submit lacks PO; confirmed/quote show it;
 * delivery emails show windows) with no per-template conditionals. The label map
 * is the single source of truth — it retires the 'Delivery'/'Estimated
 * Delivery'/'Scheduled Pickup' and 'Pickup'/'Pickup Window' label drift.
 *
 * Event-specific extras (itemized line items, totals, decline reason, changed
 * -field diffs) stay template-local and render BELOW this block.
 */
const LABELS: ReadonlyArray<readonly [keyof OrderInfoBlock, string]> = [
    ["entity_id_readable", "Order ID"],
    ["company_name", "Company"],
    ["contact", "Contact"],
    ["contact_phone", "Contact Phone"],
    ["venue", "Venue"],
    ["venue_address", "Address"],
    ["venue_access", "Access"],
    ["venue_contact", "On-site Contact"],
    ["event", "Event"],
    ["delivery_window", "Delivery Window"],
    ["pickup_window", "Pickup Window"],
    ["items", "Items"],
    ["po_number", "PO Number"],
    ["job_number", "Job Number"],
    ["special_instructions", "Instructions"],
    ["placement", "Placement"],
];

// Internal references clients shouldn't receive: job_number is an ops-side
// reference, special_instructions can carry internal handling notes.
const CLIENT_HIDDEN_KEYS: ReadonlySet<keyof OrderInfoBlock> = new Set([
    "job_number",
    "special_instructions",
]);

export function orderInfoRows(
    info?: OrderInfoBlock | null,
    opts?: { audience?: "client" | "ops" }
): string {
    if (!info) return "";
    const forClient = opts?.audience === "client";
    return LABELS.filter(([key]) => {
        if (forClient && CLIENT_HIDDEN_KEYS.has(key)) return false;
        const value = info[key];
        return typeof value === "string" && value.length > 0;
    })
        .map(([key, label]) => infoRow(label, info[key] as string))
        .join("");
}
