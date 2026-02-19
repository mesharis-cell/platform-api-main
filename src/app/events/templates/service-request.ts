import { EmailTemplate } from "./index";
import { actionButton, footer, formatAmount, infoBox, infoRow, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

// ─── sr_submitted_admin ──────────────────────────────────────────────────────
export const srSubmittedAdmin: EmailTemplate = {
    subject: (payload) => `New Service Request: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">New Service Request Submitted</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A new service request has been submitted and requires review.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Type", d.request_type)}
                ${infoRow("Billing", d.billing_mode)}
            `)}
            ${actionButton("Review Request", d.request_url)}
            ${footer()}
        `);
    },
};

// ─── sr_submitted_logistics ──────────────────────────────────────────────────
export const srSubmittedLogistics: EmailTemplate = {
    subject: (payload) => `Service Request for Review: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Service Request — Review Required</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A service request has been submitted that requires your review.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Type", d.request_type)}
                ${infoRow("Billing", d.billing_mode)}
            `)}
            ${actionButton("Review Request", d.request_url)}
            ${footer()}
        `);
    },
};

// ─── sr_quoted_client ────────────────────────────────────────────────────────
export const srQuotedClient: EmailTemplate = {
    subject: (payload) => `Service Request Quote Ready: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Quote Ready for Your Service Request</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, a quote for your service request is ready for review.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(d.final_total)} AED</p>
            `)}
            <p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review and approve or decline the quote.</p>
            ${actionButton("View Quote", d.request_url)}
            ${footer()}
        `);
    },
};

// ─── sr_quote_revised_client ─────────────────────────────────────────────────
export const srQuoteRevisedClient: EmailTemplate = {
    subject: (payload) => `Service Request Quote Revised: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Service Request Quote Updated</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, the quote for your service request has been revised and is ready for review.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Reason", d.revision_reason || "Quote updated")}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(d.final_total)} AED</p>
            `)}
            <p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review the revised quote.</p>
            ${actionButton("Review Revised Quote", d.request_url)}
            ${footer()}
        `);
    },
};

// ─── sr_approved_admin ───────────────────────────────────────────────────────
export const srApprovedAdmin: EmailTemplate = {
    subject: (payload) => `Service Request Approved: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Service Request Quote Approved</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has approved the quote for service request ${d.entity_id_readable}.</p>
            ${infoBox(
                `
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Total", `${formatAmount(d.final_total)} AED`)}
            `,
                "#f0fdf4",
                "#10b981"
            )}
            ${actionButton("View Request", d.request_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── sr_completed_client ─────────────────────────────────────────────────────
export const srCompletedClient: EmailTemplate = {
    subject: (payload) => `Service Request Complete: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #059669;">✓ Service Request Completed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your service request has been completed successfully.</p>
            ${infoBox(
                `
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
            `,
                "#f0fdf4"
            )}
            ${actionButton("View Request", d.request_url, "#059669")}
            ${footer()}
        `);
    },
};

// ─── sr_completed_admin ──────────────────────────────────────────────────────
export const srCompletedAdmin: EmailTemplate = {
    subject: (payload) => `Service Request Complete: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #059669;">✓ Service Request Completed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Service request ${d.entity_id_readable} has been marked as complete.</p>
            ${infoBox(
                `
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
            `,
                "#f0fdf4"
            )}
            ${actionButton("View Request", d.request_url, "#059669")}
            ${footer()}
        `);
    },
};

// ─── sr_invoice_client ───────────────────────────────────────────────────────
export const srInvoiceClient: EmailTemplate = {
    subject: (payload) => `Invoice Ready: ${p(payload).invoice_number}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Ready</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your invoice for service request ${d.entity_id_readable} is ready.</p>
            ${infoBox(`
                ${infoRow("Invoice Number", d.invoice_number)}
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total Amount: ${formatAmount(d.final_total)} AED</p>
            `)}
            <div style="background: #eff6ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #1e40af;">Payment Instructions</p>
                <p style="margin: 4px 0; font-size: 13px; color: #374151;">Payment Terms: Net 30 Days</p>
                <p style="margin: 4px 0; font-size: 13px; color: #374151;">Reference: ${d.invoice_number}</p>
            </div>
            ${actionButton("Download Invoice", d.download_url)}
            ${footer()}
        `);
    },
};

// ─── sr_invoice_admin ────────────────────────────────────────────────────────
export const srInvoiceAdmin: EmailTemplate = {
    subject: (payload) => `Service Request Invoice Sent: ${p(payload).invoice_number}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Sent to Client</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">An invoice has been sent for service request ${d.entity_id_readable}.</p>
            ${infoBox(`
                ${infoRow("Invoice Number", d.invoice_number)}
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(d.final_total)} AED</p>
            `)}
            ${actionButton("View Request", d.request_url)}
            ${footer()}
        `);
    },
};
