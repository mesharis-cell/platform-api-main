import { EmailTemplate } from "./index";
import { actionButton, footer, infoBox, infoRow, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

const pickupWindowRow = (d: any) => {
    const pw = d.pickup_window;
    if (!pw?.start) return "";
    const start = new Date(pw.start).toLocaleString();
    const end = pw.end ? new Date(pw.end).toLocaleString() : "";
    return infoRow("Pickup Window", end ? `${start} – ${end}` : start);
};

// ─── self_pickup_submitted_client ─────────────────────────────────────────────
export const selfPickupSubmittedClient: EmailTemplate = {
    subject: (payload) => `Self-Pickup Submitted: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Self-Pickup Request Received</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.collector_name}, your self-pickup request is being reviewed.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Collector", `${d.collector_name} (${d.collector_phone})`)}
                ${pickupWindowRow(d)}
                ${infoRow("Items", `${d.item_count} item(s), ${d.total_volume} m³`)}
            `)}
            <p style="margin: 16px 0; color: #374151;">We'll send pricing for your approval shortly.</p>
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_submitted_admin ──────────────────────────────────────────────
export const selfPickupSubmittedAdmin: EmailTemplate = {
    subject: (payload) => `New Self-Pickup: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">New Self-Pickup Request</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A new self-pickup has been submitted and requires pricing review.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Collector", `${d.collector_name} (${d.collector_phone})`)}
                ${pickupWindowRow(d)}
                ${infoRow("Items", `${d.item_count} item(s), ${d.total_volume} m³`)}
            `)}
            ${actionButton("Review Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_submitted_logistics ──────────────────────────────────────────
export const selfPickupSubmittedLogistics: EmailTemplate = {
    subject: (payload) => `New Self-Pickup for Review: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">New Self-Pickup</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A self-pickup has been submitted. Please review line items and prepare pricing.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Collector", `${d.collector_name} (${d.collector_phone})`)}
                ${pickupWindowRow(d)}
                ${infoRow("Items", `${d.item_count} item(s), ${d.total_volume} m³`)}
            `)}
            ${actionButton("Open Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_quoted_client ────────────────────────────────────────────────
export const selfPickupQuotedClient: EmailTemplate = {
    subject: (payload) => `Quote Ready: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Your Pickup Quote is Ready</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.collector_name}, pricing for your self-pickup has been prepared. Please review and approve.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${pickupWindowRow(d)}
            `)}
            ${actionButton("Review Quote", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_confirmed_admin ──────────────────────────────────────────────
export const selfPickupConfirmedAdmin: EmailTemplate = {
    subject: (payload) => `Pickup Confirmed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Self-Pickup Confirmed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has approved the quote. This pickup is now confirmed.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Collector", `${d.collector_name} (${d.collector_phone})`)}
                ${pickupWindowRow(d)}
            `)}
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_confirmed_logistics ──────────────────────────────────────────
export const selfPickupConfirmedLogistics: EmailTemplate = {
    subject: (payload) => `Pickup Confirmed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Confirmed — Prepare for Pickup</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Client approved. Prepare items for collector pickup.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Collector", `${d.collector_name} (${d.collector_phone})`)}
                ${pickupWindowRow(d)}
            `)}
            ${actionButton("Open Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_ready_client ─────────────────────────────────────────────────
export const selfPickupReadyClient: EmailTemplate = {
    subject: (payload) => `Ready for Collection: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Items Ready for Collection</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.collector_name}, your items are ready for pickup at the warehouse.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${pickupWindowRow(d)}
            `)}
            <p style="margin: 16px 0; color: #374151;">Please arrive within your pickup window with valid ID.</p>
            ${actionButton("View Details", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_picked_up_admin ──────────────────────────────────────────────
export const selfPickupPickedUpAdmin: EmailTemplate = {
    subject: (payload) => `Picked Up: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Self-Pickup Collected</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Collector has picked up all items. Pickup is now in-use.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Collector", d.collector_name)}
                ${infoRow("Company", d.company_name)}
            `)}
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_return_due_client ────────────────────────────────────────────
export const selfPickupReturnDueClient: EmailTemplate = {
    subject: (payload) => `Return Due: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Time to Return Items</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.collector_name}, your pickup is due for return.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
            `)}
            <p style="margin: 16px 0; color: #374151;">Please coordinate your return with the warehouse.</p>
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_return_due_logistics ─────────────────────────────────────────
export const selfPickupReturnDueLogistics: EmailTemplate = {
    subject: (payload) => `Pickup Return Due: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Pickup Return Due</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A self-pickup has reached its expected return date. Prepare for return scanning.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Collector", `${d.collector_name} (${d.collector_phone})`)}
                ${infoRow("Company", d.company_name)}
            `)}
            ${actionButton("Open Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_closed_admin ─────────────────────────────────────────────────
export const selfPickupClosedAdmin: EmailTemplate = {
    subject: (payload) => `Pickup Closed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const settlementsLine =
            d.settlements_applied && Number(d.settlements_applied) > 0
                ? infoRow("Settlements", `${d.settlements_applied} pooled write-off(s) recorded`)
                : "";
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Self-Pickup Closed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Return scan complete. Pickup is now closed.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Collector", d.collector_name)}
                ${infoRow("Company", d.company_name)}
                ${settlementsLine}
            `)}
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_declined_client ──────────────────────────────────────────────
export const selfPickupDeclinedClient: EmailTemplate = {
    subject: (payload) => `Quote Declined: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Quote Declined</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.collector_name}, we've recorded that you've declined this pickup quote.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${d.decline_reason ? infoRow("Your Reason", d.decline_reason) : ""}
            `)}
            <p style="margin: 16px 0; color: #374151;">If you'd like to revisit this pickup or start a new one, we're here to help.</p>
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_declined_admin ───────────────────────────────────────────────
export const selfPickupDeclinedAdmin: EmailTemplate = {
    subject: (payload) => `Quote Declined: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Self-Pickup Quote Declined</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has declined this quote.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Collector", d.collector_name)}
                ${d.decline_reason ? infoRow("Reason", d.decline_reason) : ""}
            `)}
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};

// ─── self_pickup_cancelled_admin ──────────────────────────────────────────────
export const selfPickupCancelledAdmin: EmailTemplate = {
    subject: (payload) => `Pickup Cancelled: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Self-Pickup Cancelled</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A self-pickup was cancelled.</p>
            ${infoBox(`
                ${infoRow("Pickup ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Collector", d.collector_name)}
                ${d.notes ? infoRow("Reason", d.notes) : ""}
            `)}
            ${actionButton("View Pickup", d.self_pickup_url)}
            ${footer()}
        `);
    },
};
