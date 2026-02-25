import { EmailTemplate } from "./index";
import { actionButton, footer, formatAmount, infoBox, infoRow, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

// ─── ir_submitted_client ─────────────────────────────────────────────────────
export const irSubmittedClient: EmailTemplate = {
    subject: (payload) => `Inbound Request Submitted: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Inbound Request Submitted</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your stock intake request has been received.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Incoming At", d.incoming_at)}
                ${infoRow("Items", `${d.item_count} item(s)`)}
                ${d.note ? infoRow("Note", d.note) : ""}
            `)}
            <p style="margin: 16px 0;">Our team will review the request and provide a cost estimate.</p>
            ${actionButton("View Request", d.request_url)}
            ${footer()}
        `);
    },
};

// ─── ir_submitted_admin ──────────────────────────────────────────────────────
export const irSubmittedAdmin: EmailTemplate = {
    subject: (payload) => `New Inbound Request: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">New Inbound Request Received</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A new stock intake request has been submitted and requires pricing review.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Incoming At", d.incoming_at)}
                ${infoRow("Items", `${d.item_count} item(s)`)}
            `)}
            ${actionButton("Review Request", d.request_url)}
            ${footer()}
        `);
    },
};

// ─── ir_submitted_logistics ──────────────────────────────────────────────────
export const irSubmittedLogistics: EmailTemplate = {
    subject: (payload) => `Inbound Request for Review: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Inbound Request — Logistics Review Required</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A new inbound request needs logistics pricing added.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                ${infoRow("Incoming At", d.incoming_at)}
                ${infoRow("Items", `${d.item_count} item(s)`)}
            `)}
            ${actionButton("Review & Add Pricing", d.request_url)}
            ${footer()}
        `);
    },
};

// ─── ir_quoted_client ────────────────────────────────────────────────────────
export const irQuotedClient: EmailTemplate = {
    subject: (payload) => `Cost Estimate Ready: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Cost Estimate Ready</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, the cost estimate for your inbound request is ready for review.</p>
            ${infoBox(`
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
                <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Estimated Total: ${formatAmount(d.final_total)} AED</p>
            `)}
            <p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review and approve or decline the cost estimate.</p>
            ${actionButton("View Estimate", d.request_url)}
            ${d.cost_estimate_url ? `<p style="margin: 8px 0;"><a href="${d.cost_estimate_url}" style="color: #2563eb;">Download Cost Estimate PDF</a></p>` : ""}
            ${footer()}
        `);
    },
};

// ─── ir_approved_admin ───────────────────────────────────────────────────────
export const irApprovedAdmin: EmailTemplate = {
    subject: (payload) => `Inbound Request Approved: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Inbound Request Approved</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has approved the cost estimate for inbound request ${d.entity_id_readable}.</p>
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

// ─── ir_approved_logistics ───────────────────────────────────────────────────
export const irApprovedLogistics: EmailTemplate = {
    subject: (payload) => `Inbound Request Confirmed: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Inbound Request Confirmed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Client has approved inbound request ${d.entity_id_readable}. Please prepare for incoming stock.</p>
            ${infoBox(
                `
                ${infoRow("Request ID", d.entity_id_readable)}
                ${infoRow("Company", d.company_name)}
            `,
                "#f0fdf4"
            )}
            ${actionButton("View Request", d.request_url, "#10b981")}
            ${footer()}
        `);
    },
};

// ─── ir_completed_client ─────────────────────────────────────────────────────
export const irCompletedClient: EmailTemplate = {
    subject: (payload) => `Stock Intake Complete: ${p(payload).entity_id_readable}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #059669;">✓ Stock Intake Complete</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Hi ${d.contact_name}, your inbound stock has been received and new assets have been created in your inventory.</p>
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

// ─── ir_invoice_client ───────────────────────────────────────────────────────
export const irInvoiceClient: EmailTemplate = {
    subject: (payload) => `Invoice Ready: ${p(payload).invoice_number}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Ready</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your invoice for inbound request ${d.entity_id_readable} is ready.</p>
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

// ─── ir_invoice_admin ────────────────────────────────────────────────────────
export const irInvoiceAdmin: EmailTemplate = {
    subject: (payload) => `Inbound Invoice Sent: ${p(payload).invoice_number}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Sent to Client</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">An invoice has been sent for inbound request ${d.entity_id_readable}.</p>
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
