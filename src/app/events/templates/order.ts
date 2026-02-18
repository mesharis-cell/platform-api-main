import { EmailTemplate } from "./index";
import { actionButton, footer, formatAmount, infoBox, infoRow, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

// ─── order_submitted_client ──────────────────────────────────────────────────
export const orderSubmittedClient: EmailTemplate = {
    subject: (payload) => `Order Submitted: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Order Submitted Successfully</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your order has been received and is now being reviewed.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event", `${d.event_start_date} – ${d.event_end_date}`)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${infoRow("Items", `${d.item_count} item(s), ${d.total_volume} m³`)}
            `)}
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
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event", `${d.event_start_date} – ${d.event_end_date}`)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${infoRow("Items", `${d.item_count} item(s), ${d.total_volume} m³`)}
            `)}
            ${actionButton("Review Order", d.order_url)}
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
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event", `${d.event_start_date} – ${d.event_end_date}`)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
                ${infoRow("Items", `${d.item_count} item(s), ${d.total_volume} m³`)}
            `)}
            ${actionButton("Review & Add Pricing", d.order_url)}
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
        const lineItemsHtml = lineItems.length
            ? lineItems
                  .filter(
                      (i: any) =>
                          i.billing_mode === "BILLABLE" || i.billing_mode === "COMPLIMENTARY"
                  )
                  .map((i: any) =>
                      i.billing_mode === "COMPLIMENTARY"
                          ? `<p style="margin: 6px 0;"><strong>${i.description}:</strong> Complimentary (valued at ${formatAmount(i.amount)} AED)</p>`
                          : `<p style="margin: 6px 0;"><strong>${i.description}:</strong> ${formatAmount(i.amount)} AED</p>`
                  )
                  .join("")
            : `<p style="margin: 6px 0; color: #6b7280;">No additional service items</p>`;

        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Your Quote is Ready</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your quote for order ${d.entity_id_readable} is ready for review.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 12px 0;">
                <p style="margin: 6px 0;"><strong>Logistics & Handling:</strong> ${formatAmount(pricing.base_ops_total)} AED</p>
                ${lineItemsHtml}
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 12px 0;">
                <p style="margin: 6px 0;"><strong>Subtotal:</strong> ${formatAmount(pricing.logistics_sub_total)} AED</p>
                <p style="margin: 6px 0;"><strong>Service Fee:</strong> ${formatAmount(pricing.margin_amount)} AED</p>
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(d.final_total)} AED</p>
            `)}
            <p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review and approve or decline the quote.</p>
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
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Your Quote Has Been Revised</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, the quote for order ${d.entity_id_readable} has been updated.</p>
            ${infoBox(`
                ${infoRow("Previous Total", `${formatAmount(d.previous_total)} AED`)}
                ${infoRow("New Total", `${formatAmount(d.new_total)} AED`)}
                ${d.revision_reason ? infoRow("Reason", d.revision_reason) : ""}
            `)}
            <p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review and approve or decline the revised quote.</p>
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
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The quote for order ${d.entity_id_readable} has been revised and the client has been notified.</p>
            ${infoBox(`
                ${infoRow("Previous Total", `${formatAmount(d.previous_total)} AED`)}
                ${infoRow("New Total", `${formatAmount(d.new_total)} AED`)}
                ${d.revision_reason ? infoRow("Reason", d.revision_reason) : ""}
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

// ─── order_confirmed_client ──────────────────────────────────────────────────
export const orderConfirmedClient: EmailTemplate = {
    subject: (payload) => `Order Confirmed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Confirmed & Proceeding to Fulfillment</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your order has been confirmed and assets are reserved. Fulfillment is beginning.</p>
            ${infoBox(
                `
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event Date", d.event_start_date)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
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
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Confirmed — In Preparation</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} has been confirmed and is now in preparation.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event Date", d.event_start_date)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
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
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Confirmed — Begin Preparation</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${d.entity_id_readable} is confirmed. Please begin warehouse preparation.</p>
            ${infoBox(`
                ${infoRow("Order ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Event Date", d.event_start_date)}
                ${infoRow("Venue", `${d.venue_name}, ${d.venue_city}`)}
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
                ${d.delivery_window ? infoRow("Delivery Window", d.delivery_window) : ""}
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
                ${d.delivery_window ? infoRow("Estimated Delivery", d.delivery_window) : ""}
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
                ${d.delivery_window ? infoRow("Delivery Window", d.delivery_window) : ""}
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
                ${d.pickup_window ? infoRow("Pickup Window", d.pickup_window) : ""}
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
                ${d.pickup_window ? infoRow("Pickup Window", d.pickup_window) : ""}
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
                ${d.pickup_window ? infoRow("Scheduled Pickup", d.pickup_window) : ""}
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
                ${infoRow("Pickup Window", d.pickup_window)}
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
                ${infoRow("Pickup Window", d.pickup_window)}
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
                ${infoRow("Pickup Window", d.pickup_window)}
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
                ${d.delivery_window ? infoRow("Delivery Window", d.delivery_window) : ""}
                ${d.pickup_window ? infoRow("Pickup Window", d.pickup_window) : ""}
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
                ${d.delivery_window ? infoRow("Delivery Window", d.delivery_window) : ""}
                ${d.pickup_window ? infoRow("Pickup Window", d.pickup_window) : ""}
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
