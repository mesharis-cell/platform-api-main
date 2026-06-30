import { EmailTemplate } from "./index";
import { actionButton, footer, formatAmount, formatWindow, infoBox, infoRow, wrap } from "./base";
import { orderInfoRows } from "./order-info-rows";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

// When a company manager approves/declines a colleague's quote, the event
// payload carries acted_by_name + on_behalf_of_name (see order.services
// buildQuoteAttribution). Render an attribution row; empty string otherwise.
const actedByRow = (d: Record<string, any>) =>
    d.acted_by_name
        ? infoRow("Actioned by", `${d.acted_by_name} (on behalf of ${d.on_behalf_of_name})`)
        : "";

// ─── order_submitted_client ──────────────────────────────────────────────────
export const orderSubmittedClient: EmailTemplate = {
    subject: (payload) => `Order Submitted: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Order Submitted Successfully</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your order has been received and is now being reviewed.</p>
            ${infoBox(orderInfoRows(d.order_info))}
            <p style="margin: 16px 0; color: #374151;">Our team will review your order and send pricing within 24 hours.</p>
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── order_submitted_admin ───────────────────────────────────────────────────
export const orderSubmittedAdmin: EmailTemplate = {
    subject: (payload) => `New Order Submitted: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">New Order Received</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A new order has been submitted and requires pricing review.</p>
            ${infoBox(orderInfoRows(d.order_info))}
            ${actionButton("Review Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── order_pending_approval_admin (logistics → admin review) ─────────────────
export const orderPendingApprovalAdmin: EmailTemplate = {
    subject: (payload) => `Pricing ready for review: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const totalLine =
            d.pending_total != null && String(d.pending_total).length > 0
                ? infoRow("Indicative total (admin view)", `${formatAmount(d.pending_total)} AED`)
                : "";
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Pricing submitted for your review</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Logistics (${d.submitted_by_name || "team"}) has submitted pricing for this order. Please review margin and approve to send the quote to the client.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event", `${d.event_start_date} – ${d.event_end_date}`)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${infoRow("Contact", `${d.contact_name} (${d.contact_email})`)}
                ${totalLine}
            `)}
            ${actionButton("Review & approve", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── order_submitted_logistics ───────────────────────────────────────────────
export const orderSubmittedLogistics: EmailTemplate = {
    subject: (payload) => `New Order for Review: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Order Submitted — Logistics Review Required</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A new order has been submitted. Please review the logistics requirements and add pricing.</p>
            ${infoBox(orderInfoRows(d.order_info))}
            ${actionButton("Review & Add Pricing", d.order_url)}
            ${footer()}
        `);
    },
};

const renderRepairItems = (items: any[]) => {
    if (!Array.isArray(items) || items.length === 0) return "";
    return `
        <ul style="margin: 8px 0 0; padding-left: 18px; color: #374151;">
            ${items
                .map((item) => {
                    const name = item.asset_name || "Item";
                    const due = item.due_at ? `, due ${item.due_at}` : "";
                    return `<li style="margin: 4px 0;">${name}${due}</li>`;
                })
                .join("")}
        </ul>
    `;
};

export const repairBeforeEventAdmin: EmailTemplate = {
    subject: (payload) => `Repair Before Event Required: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const repairItems = Array.isArray(d.repair_items) ? d.repair_items : [];
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Repair Before Event Required</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">This order includes item(s) that need repair before the event. Warehouse tasks have been created and fulfillment will remain blocked until repair is completed or an admin exception is approved.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event", `${d.event_start_date} - ${d.event_end_date}`)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${infoRow("Repair tasks", `${repairItems.length}`)}
                ${renderRepairItems(repairItems)}
            `)}
            ${actionButton("Review Order", d.order_url)}
            ${footer()}
        `);
    },
};

export const repairBeforeEventLogistics: EmailTemplate = {
    subject: (payload) => `Repair Before Event: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const repairItems = Array.isArray(d.repair_items) ? d.repair_items : [];
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Repair Before Event Tasks</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Repair tasks are ready in the warehouse queue for this order. Complete each task before delivery.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event", `${d.event_start_date} - ${d.event_end_date}`)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${infoRow("Repair tasks", `${repairItems.length}`)}
                ${renderRepairItems(repairItems)}
            `)}
            ${actionButton("Open Order", d.order_url)}
            ${footer()}
        `);
    },
};

export const maintenanceDecisionChangeRequestedAdmin: EmailTemplate = {
    subject: (payload) => `Maintenance Decision Change Requested: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Maintenance Decision Change Requested</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A client requested a change to an item repair decision. Review the order before sending the quote.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Item", d.asset_name || "Item")}
                ${infoRow("Requested decision", d.requested_decision_label || d.requested_decision)}
            `)}
            ${actionButton("Review Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── quote_sent_client ───────────────────────────────────────────────────────
export const quoteSentClient: EmailTemplate = {
    subject: (payload) => `Quote Ready: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const pricing = d.pricing || {};
        const lineItems = Array.isArray(d.line_items) ? d.line_items : [];
        const qtyLabel = (i: any) => {
            if (i.quantity == null) return "";
            const unit = i.unit ? ` ${i.unit}` : "";
            return ` (${i.quantity}${unit})`;
        };
        // Mirrors client UI behavior: when a line's price is hidden
        // (total = null) we render the label only — no "Pricing hidden"
        // placeholder, no colon, no amount. Total at the bottom is
        // always shown.
        const priceLabel = (i: any): string => {
            if (i.billing_mode === "COMPLIMENTARY") {
                return i.total != null
                    ? `Complimentary (valued at ${formatAmount(i.total)} AED)`
                    : "Complimentary";
            }
            return i.total != null ? `${formatAmount(i.total)} AED` : "";
        };
        const renderLineRow = (i: any): string => {
            const label = `${i.label}${qtyLabel(i)}`;
            const price = priceLabel(i);
            return price
                ? `<p style="margin: 6px 0;"><strong>${label}:</strong> ${price}</p>`
                : `<p style="margin: 6px 0;"><strong>${label}</strong></p>`;
        };
        const lineItemsHtml = lineItems.length
            ? lineItems
                  .filter(
                      (i: any) =>
                          i.billing_mode === "BILLABLE" || i.billing_mode === "COMPLIMENTARY"
                  )
                  .map(renderLineRow)
                  .join("")
            : `<p style="margin: 6px 0; color: #6b7280;">No additional service items</p>`;
        // Picking & Handling — same visibility rule as line items. The
        // payload sends pricing.base_ops_total only when the client is
        // allowed to see it; otherwise we render the label alone.
        const baseOpsHtml =
            pricing.base_ops_total != null
                ? `<p style="margin: 6px 0;"><strong>Picking & Handling:</strong> ${formatAmount(pricing.base_ops_total)} AED</p>`
                : `<p style="margin: 6px 0;"><strong>Picking & Handling</strong></p>`;

        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Your Quote is Ready</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your quote for order ${d.entity_id_readable} is ready for review.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 12px 0;">
                ${baseOpsHtml}
                ${lineItemsHtml}
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 12px 0;">
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(d.final_total)} AED</p>
            `)}
            <p style="margin: 16px 0; color: #dc2626; font-weight: 600;">Action Required: Please review and approve or decline the quote.</p>
            ${actionButton("View Quote", d.order_url)}
            ${d.cost_estimate_url ? `<p style="margin: 8px 0;"><a href="${d.cost_estimate_url}" style="color: #2563eb;">Download Cost Estimate PDF</a></p>` : ""}
            ${footer()}
        `);
    },
};

// ─── quote_sent_admin ────────────────────────────────────────────────────────
export const quoteSentAdmin: EmailTemplate = {
    subject: (payload) => `Quote Sent to Client: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Quote Sent to Client</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A quote has been sent to the client for order ${d.entity_id_readable}.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Total", `${formatAmount(d.final_total)} AED`)}
            `)}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── quote_revised_client ────────────────────────────────────────────────────
export const quoteRevisedClient: EmailTemplate = {
    subject: (payload) => `Revised Quote: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        // Deliberately generic — no figures. A revised quote is a fresh quote to review in full
        // on the portal; surfacing a "previous → new" delta in the email invited disputes over
        // email (and previously printed a misleading identical "Previous == New" when the revision
        // was line-item-driven rather than a margin change). The client opens the order to see the
        // actual revised breakdown and download the new cost estimate.
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Your Quote Has Been Revised</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, the quote for order ${d.entity_id_readable} has been updated.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${d.company_name ? infoRow("Company", d.company_name) : ""}
            `)}
            <p style="margin: 16px 0; color: #dc2626; font-weight: 600;">Action Required: Please review and approve or decline the revised quote.</p>
            ${actionButton("View Revised Quote", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── quote_revised_admin ─────────────────────────────────────────────────────
export const quoteRevisedAdmin: EmailTemplate = {
    subject: (payload) => `Quote Revised: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Quote Revised — Client Notified</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The quote for order ${d.entity_id_readable} has been revised and re-sent to the client for approval.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
            `)}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── quote_approved_admin ────────────────────────────────────────────────────
export const quoteApprovedAdmin: EmailTemplate = {
    subject: (payload) => `Quote Approved: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Quote Approved</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has approved the quote. The order is proceeding to invoicing.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${actedByRow(d)}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(d.final_total)} AED</p>
            `,
                "#f0fdf4",
                "#10b981"
            )}
            <p style="margin: 16px 0;">Next Steps: Generate an invoice and send it to the client.</p>
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── quote_approved_logistics ────────────────────────────────────────────────
export const quoteApprovedLogistics: EmailTemplate = {
    subject: (payload) => `Order Confirmed by Client: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Client Approved Quote</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has approved the quote for order ${d.entity_id_readable}.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${actedByRow(d)}
                ${infoRow("Total", `${formatAmount(d.final_total)} AED`)}
            `,
                "#f0fdf4",
                "#10b981"
            )}
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── quote_declined_admin ────────────────────────────────────────────────────
export const quoteDeclinedAdmin: EmailTemplate = {
    subject: (payload) => `Quote Declined: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Quote Declined</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has declined the quote for order ${d.entity_id_readable}.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${actedByRow(d)}
            `,
                "#fef2f2",
                "#dc2626"
            )}
            <p style="margin: 16px 0;">You may want to follow up with the client to understand their concerns.</p>
            ${actionButton("View Order", d.order_url, "#dc2626")}
            ${footer()}
        `);
    },
};

// ─── quote_declined_logistics ────────────────────────────────────────────────
export const quoteDeclinedLogistics: EmailTemplate = {
    subject: (payload) => `Quote Declined: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Quote Declined by Client</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has declined the quote for order ${d.entity_id_readable}.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${actedByRow(d)}
            `,
                "#fef2f2",
                "#dc2626"
            )}
            ${actionButton("View Order", d.order_url, "#dc2626")}
            ${footer()}
        `);
    },
};

// ─── invoice_generated_client ────────────────────────────────────────────────
export const invoiceGeneratedClient: EmailTemplate = {
    subject: (payload) => `Invoice Ready: ${p(payload).invoice_number}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Ready for Payment</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your invoice is ready. Please process payment to proceed with fulfillment.</p>
            ${infoBox(`
                ${infoRow("Invoice Number", d.invoice_number)}
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Amount Due: ${formatAmount(d.final_total)} AED</p>
            `)}
            <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #1e40af;">Payment Instructions</p>
                <p style="margin: 4px 0; font-size: 13px; color: #374151;">Payment Terms: Net 30 Days</p>
                <p style="margin: 4px 0; font-size: 13px; color: #374151;">Reference: ${d.invoice_number}</p>
            </div>
            ${actionButton("Download Invoice", d.download_url)}
            <p style="margin: 8px 0;"><a href="${d.order_url}" style="color: #2563eb;">View Order</a></p>
            ${footer()}
        `);
    },
};

// ─── invoice_generated_admin ─────────────────────────────────────────────────
export const invoiceGeneratedAdmin: EmailTemplate = {
    subject: (payload) => `Invoice Sent to Client: ${p(payload).invoice_number}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Sent to Client</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">An invoice has been sent to the client for order ${d.entity_id_readable}.</p>
            ${infoBox(`
                ${infoRow("Invoice Number", d.invoice_number)}
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(d.final_total)} AED</p>
            `)}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── payment_confirmed_admin ─────────────────────────────────────────────────
export const paymentConfirmedAdmin: EmailTemplate = {
    subject: (payload) => `Payment Confirmed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Payment Confirmed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Payment has been received and confirmed for this order.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${d.invoice_number ? infoRow("Invoice", d.invoice_number) : ""}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Amount Paid: ${formatAmount(d.final_total)} AED</p>
            `,
                "#f0fdf4"
            )}
            <p style="margin: 16px 0;">Next Steps: Confirm the order to begin fulfillment.</p>
            ${actionButton("Proceed with Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── payment_confirmed_logistics ─────────────────────────────────────────────
export const paymentConfirmedLogistics: EmailTemplate = {
    subject: (payload) => `Payment Received: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Payment Confirmed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Payment has been confirmed for order ${d.entity_id_readable}. Fulfillment can proceed.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Total", `${formatAmount(d.final_total)} AED`)}
            `,
                "#f0fdf4"
            )}
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── helpers for the order-confirmed templates ─────────────────────────────
// Local to this file (no churn on base.ts). Date-only formatter for event
// dates — formatWindow attaches HH:MM which is misleading for the event row
// since the schema collects event dates as date-only (no time component).
const TZ = "Asia/Dubai";

function formatEventDate(date: string | undefined): string {
    if (!date) return "";
    try {
        return new Date(date).toLocaleString("en-GB", {
            timeZone: TZ,
            weekday: "short",
            day: "numeric",
            month: "short",
        });
    } catch {
        return "";
    }
}

// Show "start - end" when both present. When end is missing or identical to
// start (the latter shouldn't happen given the NOT NULL constraint on
// event_end_date, but defensive), collapse to just the start.
function eventRange(start: string | undefined, end: string | undefined): string {
    const s = formatEventDate(start);
    if (!s) return "";
    const e = formatEventDate(end);
    if (!e || e === s) return s;
    return `${s} - ${e}`;
}

// "<street>, <city>, <country>" — drops missing parts and dangling commas
// via filter+join. Returns "" when everything is missing so the row can be
// gated upstream.
function composeAddress(
    venueLocation: { address?: string; country?: string } | null | undefined,
    venueCity: string | undefined
): string {
    return [venueLocation?.address?.trim(), venueCity, venueLocation?.country]
        .filter(Boolean)
        .join(", ");
}

// ─── order_confirmed_client ──────────────────────────────────────────────────
export const orderConfirmedClient: EmailTemplate = {
    subject: (payload) => `Order Confirmed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const eventRow = eventRange(d.event_start_date, d.event_end_date);
        const addressRow = composeAddress(d.venue_location, d.venue_city);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Confirmed & Proceeding to Fulfillment</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your order has been confirmed and assets are reserved. Fulfillment is beginning.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${eventRow ? infoRow("Event", eventRow) : ""}
                ${d.delivery_window ? infoRow("Delivery", formatWindow(d.delivery_window, TZ)) : ""}
                ${d.pickup_window ? infoRow("Pickup", formatWindow(d.pickup_window, TZ)) : ""}
                ${d.venue_name ? infoRow("Venue", d.venue_name) : ""}
                ${addressRow ? infoRow("Address", addressRow) : ""}
                ${d.venue_location?.access_notes ? infoRow("Access", d.venue_location.access_notes) : ""}
            `,
                "#eff6ff"
            )}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── order_confirmed_admin ───────────────────────────────────────────────────
export const orderConfirmedAdmin: EmailTemplate = {
    subject: (payload) => `Order In Preparation: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const eventRow = eventRange(d.event_start_date, d.event_end_date);
        const addressRow = composeAddress(d.venue_location, d.venue_city);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Confirmed — In Preparation</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} has been confirmed and is now in preparation.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${eventRow ? infoRow("Event", eventRow) : ""}
                ${d.delivery_window ? infoRow("Delivery", formatWindow(d.delivery_window, TZ)) : ""}
                ${d.pickup_window ? infoRow("Pickup", formatWindow(d.pickup_window, TZ)) : ""}
                ${d.venue_name ? infoRow("Venue", d.venue_name) : ""}
                ${addressRow ? infoRow("Address", addressRow) : ""}
                ${d.venue_location?.access_notes ? infoRow("Access", d.venue_location.access_notes) : ""}
            `)}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── order_confirmed_logistics ───────────────────────────────────────────────
export const orderConfirmedLogistics: EmailTemplate = {
    subject: (payload) => `Start Preparation: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const eventRow = eventRange(d.event_start_date, d.event_end_date);
        const addressRow = composeAddress(d.venue_location, d.venue_city);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Confirmed — Begin Preparation</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} is confirmed. Please begin warehouse preparation.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${eventRow ? infoRow("Event", eventRow) : ""}
                ${d.delivery_window ? infoRow("Delivery", formatWindow(d.delivery_window, TZ)) : ""}
                ${d.pickup_window ? infoRow("Pickup", formatWindow(d.pickup_window, TZ)) : ""}
                ${d.venue_name ? infoRow("Venue", d.venue_name) : ""}
                ${addressRow ? infoRow("Address", addressRow) : ""}
                ${d.venue_location?.access_notes ? infoRow("Access", d.venue_location.access_notes) : ""}
            `)}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── order_cancelled_client ──────────────────────────────────────────────────
export const orderCancelledClient: EmailTemplate = {
    subject: (payload) => `Order Cancelled: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Order Cancelled</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, order ${d.entity_id_readable} has been cancelled.</p>
            ${infoBox(
                `
                ${d.cancellation_reason ? infoRow("Reason", d.cancellation_reason) : ""}
                ${d.cancellation_notes ? infoRow("Notes", d.cancellation_notes) : ""}
            `,
                "#fef2f2"
            )}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── order_cancelled_admin ───────────────────────────────────────────────────
export const orderCancelledAdmin: EmailTemplate = {
    subject: (payload) => `Order Cancelled: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Order Cancelled</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} (${d.company_name}) has been cancelled.</p>
            ${infoBox(
                `
                ${d.cancellation_reason ? infoRow("Reason", d.cancellation_reason) : ""}
                ${d.cancellation_notes ? infoRow("Notes", d.cancellation_notes) : ""}
            `,
                "#fef2f2"
            )}
            ${actionButton("View Order", d.order_url, "#dc2626")}
            ${footer()}
        `);
    },
};

// ─── order_cancelled_logistics ───────────────────────────────────────────────
export const orderCancelledLogistics: EmailTemplate = {
    subject: (payload) => `Order Cancelled: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Order Cancelled</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} has been cancelled. Please ensure no preparation resources are committed.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${d.cancellation_reason ? infoRow("Reason", d.cancellation_reason) : ""}
            `,
                "#fef2f2"
            )}
            ${actionButton("View Order", d.order_url, "#dc2626")}
            ${footer()}
        `);
    },
};

// ─── order_ready_admin ───────────────────────────────────────────────────────
export const orderReadyAdmin: EmailTemplate = {
    subject: (payload) => `Ready for Delivery: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #8b5cf6;">All Items Scanned & Ready for Delivery</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">All items for order ${d.entity_id_readable} have been scanned out and are ready to dispatch.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Venue", d.venue_name)}
                ${d.delivery_window ? infoRow("Delivery Window", formatWindow(d.delivery_window)) : ""}
            `,
                "#f5f3ff"
            )}
            ${actionButton("View Order", d.order_url, "#8b5cf6")}
            ${footer()}
        `);
    },
};

// ─── order_in_transit_client ─────────────────────────────────────────────────
export const orderInTransitClient: EmailTemplate = {
    subject: (payload) => `Order In Transit: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #0ea5e9;">🚚 Your Order is On The Way</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your items are in transit to the venue.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${d.delivery_window ? infoRow("Estimated Delivery", formatWindow(d.delivery_window)) : ""}
            `,
                "#f0f9ff"
            )}
            <p style="margin: 16px 0;">Please ensure someone is available to receive the delivery.</p>
            ${actionButton("Track Order", d.order_url, "#0ea5e9")}
            ${footer()}
        `);
    },
};

// ─── order_in_transit_admin ──────────────────────────────────────────────────
export const orderInTransitAdmin: EmailTemplate = {
    subject: (payload) => `In Transit: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #0ea5e9;">🚚 Order In Transit</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} is now in transit.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${d.delivery_window ? infoRow("Delivery Window", formatWindow(d.delivery_window)) : ""}
            `)}
            ${actionButton("View Order", d.order_url, "#0ea5e9")}
            ${footer()}
        `);
    },
};

// ─── order_delivered_client ──────────────────────────────────────────────────
export const orderDeliveredClient: EmailTemplate = {
    subject: (payload) => `Order Delivered: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Order Delivered Successfully</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your order has been delivered to the venue.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Venue", d.venue_name)}
                ${d.pickup_window ? infoRow("Pickup Window", formatWindow(d.pickup_window)) : ""}
            `)}
            <p style="margin: 16px 0;">Please remember to prepare items for return during the scheduled pickup window.</p>
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── order_delivered_admin ───────────────────────────────────────────────────
export const orderDeliveredAdmin: EmailTemplate = {
    subject: (payload) => `Delivered: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Order Delivered</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} has been delivered to the venue.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Venue", d.venue_name)}
                ${d.pickup_window ? infoRow("Pickup Window", formatWindow(d.pickup_window)) : ""}
            `)}
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── order_delivered_logistics ───────────────────────────────────────────────
export const orderDeliveredLogistics: EmailTemplate = {
    subject: (payload) => `Delivery Confirmed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Delivery Confirmed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} has been delivered successfully.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Venue", d.venue_name)}
                ${d.pickup_window ? infoRow("Scheduled Pickup", formatWindow(d.pickup_window)) : ""}
            `)}
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── pickup_reminder_client ──────────────────────────────────────────────────
export const pickupReminderClient: EmailTemplate = {
    subject: (payload) => `Pickup Reminder: ${p(payload).entity_id_readable} — 48 Hours`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #f59e0b;">⏰ Pickup Reminder</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your order is scheduled for pickup in 48 hours.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Pickup Window", formatWindow(d.pickup_window))}
                ${infoRow("Venue", d.venue_name)}
            `,
                "#fef3c7",
                "#f59e0b"
            )}
            <p style="margin: 16px 0; font-weight: 600;">Please ensure all items are ready for pickup at the scheduled time.</p>
            ${actionButton("View Order", d.order_url, "#f59e0b")}
            ${footer()}
        `);
    },
};

// ─── pickup_reminder_admin ───────────────────────────────────────────────────
export const pickupReminderAdmin: EmailTemplate = {
    subject: (payload) => `Pickup in 48h: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #f59e0b;">⏰ Pickup Reminder — 48 Hours</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} is scheduled for pickup in 48 hours.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Venue", d.venue_name)}
                ${infoRow("Pickup Window", formatWindow(d.pickup_window))}
            `,
                "#fef3c7",
                "#f59e0b"
            )}
            ${actionButton("View Order", d.order_url, "#f59e0b")}
            ${footer()}
        `);
    },
};

// ─── pickup_reminder_logistics ───────────────────────────────────────────────
export const pickupReminderLogistics: EmailTemplate = {
    subject: (payload) => `Pickup in 48h: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #f59e0b;">⏰ Pickup Reminder — Action Required</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} is scheduled for pickup in 48 hours. Please coordinate transport.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Venue", d.venue_name)}
                ${infoRow("Pickup Window", formatWindow(d.pickup_window))}
            `,
                "#fef3c7",
                "#f59e0b"
            )}
            ${actionButton("View Order", d.order_url, "#f59e0b")}
            ${footer()}
        `);
    },
};

// ─── order_closed_admin ──────────────────────────────────────────────────────
export const orderClosedAdmin: EmailTemplate = {
    subject: (payload) => `Order Completed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #059669;">✓ Order Complete</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">All items have been returned. Order ${d.entity_id_readable} is closed.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event", `${d.event_start_date} – ${d.event_end_date}`)}
            `,
                "#f0fdf4"
            )}
            ${actionButton("View Order Summary", d.order_url, "#059669")}
            ${footer()}
        `);
    },
};

// ─── time_windows_updated_client ─────────────────────────────────────────────
export const timeWindowsUpdatedClient: EmailTemplate = {
    subject: (payload) => `Delivery Schedule Updated: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Delivery Schedule Updated</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, the delivery and pickup windows for your order have been updated.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${d.delivery_window ? infoRow("Delivery Window", formatWindow(d.delivery_window)) : ""}
                ${d.pickup_window ? infoRow("Pickup Window", formatWindow(d.pickup_window)) : ""}
            `,
                "#eff6ff"
            )}
            <p style="margin: 16px 0;">Please ensure availability during the scheduled time windows.</p>
            ${actionButton("View Updated Schedule", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── time_windows_updated_admin ──────────────────────────────────────────────
export const timeWindowsUpdatedAdmin: EmailTemplate = {
    subject: (payload) => `Schedule Updated: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Time Windows Updated</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The delivery/pickup windows for order ${d.entity_id_readable} have been updated.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${d.delivery_window ? infoRow("Delivery Window", formatWindow(d.delivery_window)) : ""}
                ${d.pickup_window ? infoRow("Pickup Window", formatWindow(d.pickup_window)) : ""}
            `)}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

// ─── fabrication_completed_logistics ─────────────────────────────────────────
export const fabricationCompletedLogistics: EmailTemplate = {
    subject: (payload) => `Fabrication Complete: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const items = Array.isArray(d.fabrication_items) ? d.fabrication_items : [];
        const itemsHtml = items.length
            ? items
                  .map(
                      (i: any) =>
                          `<p style="margin: 8px 0;"><strong>${i.original_asset_name}</strong> → ${i.new_asset_name} (QR: ${i.new_qr_code})</p>`
                  )
                  .join("")
            : `<p style="margin: 8px 0;">All rebranding items complete.</p>`;

        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">Fabrication Complete</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Fabrication for order ${d.entity_id_readable} is complete. Please begin preparation.</p>
            ${infoBox(itemsHtml, "#f0fdf4")}
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── fabrication_completed_admin ─────────────────────────────────────────────
export const fabricationCompletedAdmin: EmailTemplate = {
    subject: (payload) => `Fabrication Complete: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">Fabrication / Rebranding Complete</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">All fabrication items for order ${d.entity_id_readable} are complete.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
            `,
                "#f0fdf4"
            )}
            ${actionButton("View Order", d.order_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── order.updated (entity-edit feature) ─────────────────────────────────────
// Human labels for the changed-field diff rendered in the edit emails. Anything
// not mapped falls back to a de-underscored version of the raw column name.
const ORDER_FIELD_LABELS: Record<string, string> = {
    contact_name: "Contact name",
    contact_email: "Contact email",
    contact_phone: "Contact phone",
    venue_contact_name: "Venue contact name",
    venue_contact_email: "Venue contact email",
    venue_contact_phone: "Venue contact phone",
    venue_name: "Venue name",
    venue_location: "Venue location",
    special_instructions: "Special instructions",
    permit_requirements: "Permit requirements",
    is_permanent_placement: "Permanent placement",
    po_number: "PO number",
    job_number: "Job number",
    event_start_date: "Event start",
    event_end_date: "Event end",
};
const humanizeOrderField = (f: string) =>
    ORDER_FIELD_LABELS[f] ?? f.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const fmtChangeValue = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
};
const changedFieldsRows = (d: Record<string, any>) => {
    const fields: Array<{ field: string; old: unknown; new: unknown }> = Array.isArray(
        d.changed_fields
    )
        ? d.changed_fields
        : [];
    if (fields.length === 0) return infoRow("Changes", "—");
    return fields
        .map((c) =>
            infoRow(
                humanizeOrderField(c.field),
                `${fmtChangeValue(c.old)} → ${fmtChangeValue(c.new)}`
            )
        )
        .join("");
};

export const orderUpdatedAdmin: EmailTemplate = {
    subject: (payload) => `Order Edited: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        const lead = d.status_reverted
            ? `<p style="margin: 0 0 16px; font-size: 16px; color: #b45309;">Order ${d.entity_id_readable} was edited after pricing and has been sent back for <strong>re-review</strong>. Please re-check pricing and re-issue the quote.</p>`
            : `<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} was edited.</p>`;
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Edited</h1>
            ${lead}
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${actedByRow(d)}
            `)}
            ${
                Array.isArray(d.changed_fields) && d.changed_fields.length > 0
                    ? infoBox(changedFieldsRows(d), "#f9fafb")
                    : ""
            }
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};

export const orderUpdatedClient: EmailTemplate = {
    subject: (payload) => `Your Order Was Updated: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Updated</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name ?? "there"}, the details of your order ${d.entity_id_readable} have been updated.</p>
            ${infoBox(changedFieldsRows(d), "#eff6ff")}
            ${actionButton("View Order", d.order_url)}
            ${footer()}
        `);
    },
};
