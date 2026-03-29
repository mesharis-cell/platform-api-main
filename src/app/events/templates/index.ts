// ============================================================
// Template Registry
// ============================================================

export interface EmailTemplate {
    subject: (payload: Record<string, unknown>) => string;
    html: (payload: Record<string, unknown>) => string;
}

const htmlToText = (html: string) =>
    html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<\/(p|div|tr|h1|h2|h3|h4|h5|h6|li|br|table|section)>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<a [^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2 ($1)")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

// Order templates
import {
    fabricationCompletedAdmin,
    fabricationCompletedLogistics,
    invoiceGeneratedAdmin,
    invoiceGeneratedClient,
    orderCancelledAdmin,
    orderCancelledClient,
    orderCancelledLogistics,
    orderClosedAdmin,
    orderConfirmedAdmin,
    orderConfirmedClient,
    orderConfirmedLogistics,
    orderDeliveredAdmin,
    orderDeliveredClient,
    orderDeliveredLogistics,
    orderInTransitAdmin,
    orderInTransitClient,
    orderReadyAdmin,
    orderSubmittedAdmin,
    orderSubmittedClient,
    orderSubmittedLogistics,
    paymentConfirmedAdmin,
    paymentConfirmedLogistics,
    pickupReminderAdmin,
    pickupReminderClient,
    pickupReminderLogistics,
    quoteApprovedAdmin,
    quoteApprovedLogistics,
    quoteDeclinedAdmin,
    quoteDeclinedLogistics,
    quoteRevisedAdmin,
    quoteRevisedClient,
    quoteSentAdmin,
    quoteSentClient,
    timeWindowsUpdatedAdmin,
    timeWindowsUpdatedClient,
} from "./order";

// Inbound request templates
import {
    irApprovedAdmin,
    irApprovedLogistics,
    irCompletedClient,
    irInvoiceAdmin,
    irInvoiceClient,
    irQuotedClient,
    irSubmittedAdmin,
    irSubmittedClient,
    irSubmittedLogistics,
} from "./inbound-request";

// Service request templates
import {
    srApprovedAdmin,
    srCompletedAdmin,
    srCompletedClient,
    srInvoiceAdmin,
    srInvoiceClient,
    srQuotedClient,
    srQuoteRevisedClient,
    srSubmittedAdmin,
    srSubmittedLogistics,
} from "./service-request";

// Self-booking templates
import {
    selfBookingCancelledAdmin,
    selfBookingCompletedAdmin,
    selfBookingCreatedAdmin,
} from "./self-booking";

// Auth templates
import { passwordResetOtp } from "./auth";
import { lineItemRequestSubmittedAdmin } from "./line-item-request";
import {
    workflowRequestCancelledAdmin,
    workflowRequestCancelledLogistics,
    workflowRequestCompletedAdmin,
    workflowRequestCompletedLogistics,
    workflowRequestStatusChangedAdmin,
    workflowRequestStatusChangedLogistics,
    workflowRequestSubmittedAdmin,
    workflowRequestSubmittedLogistics,
} from "./workflow-request";
import { clearTemplateSupportEmail, setTemplateSupportEmail } from "./base";

const registry: Record<string, EmailTemplate> = {
    // Orders
    order_submitted_client: orderSubmittedClient,
    order_submitted_admin: orderSubmittedAdmin,
    order_submitted_logistics: orderSubmittedLogistics,
    quote_sent_client: quoteSentClient,
    quote_sent_admin: quoteSentAdmin,
    quote_revised_client: quoteRevisedClient,
    quote_revised_admin: quoteRevisedAdmin,
    quote_approved_admin: quoteApprovedAdmin,
    quote_approved_logistics: quoteApprovedLogistics,
    quote_declined_admin: quoteDeclinedAdmin,
    quote_declined_logistics: quoteDeclinedLogistics,
    invoice_generated_client: invoiceGeneratedClient,
    invoice_generated_admin: invoiceGeneratedAdmin,
    payment_confirmed_admin: paymentConfirmedAdmin,
    payment_confirmed_logistics: paymentConfirmedLogistics,
    order_confirmed_client: orderConfirmedClient,
    order_confirmed_admin: orderConfirmedAdmin,
    order_confirmed_logistics: orderConfirmedLogistics,
    order_cancelled_client: orderCancelledClient,
    order_cancelled_admin: orderCancelledAdmin,
    order_cancelled_logistics: orderCancelledLogistics,
    order_ready_admin: orderReadyAdmin,
    order_in_transit_client: orderInTransitClient,
    order_in_transit_admin: orderInTransitAdmin,
    order_delivered_client: orderDeliveredClient,
    order_delivered_admin: orderDeliveredAdmin,
    order_delivered_logistics: orderDeliveredLogistics,
    pickup_reminder_client: pickupReminderClient,
    pickup_reminder_admin: pickupReminderAdmin,
    pickup_reminder_logistics: pickupReminderLogistics,
    order_closed_admin: orderClosedAdmin,
    time_windows_updated_client: timeWindowsUpdatedClient,
    time_windows_updated_admin: timeWindowsUpdatedAdmin,
    fabrication_completed_logistics: fabricationCompletedLogistics,
    fabrication_completed_admin: fabricationCompletedAdmin,

    // Inbound requests
    ir_submitted_client: irSubmittedClient,
    ir_submitted_admin: irSubmittedAdmin,
    ir_submitted_logistics: irSubmittedLogistics,
    ir_quoted_client: irQuotedClient,
    ir_approved_admin: irApprovedAdmin,
    ir_approved_logistics: irApprovedLogistics,
    ir_completed_client: irCompletedClient,
    ir_invoice_client: irInvoiceClient,
    ir_invoice_admin: irInvoiceAdmin,

    // Service requests
    sr_submitted_admin: srSubmittedAdmin,
    sr_submitted_logistics: srSubmittedLogistics,
    sr_quoted_client: srQuotedClient,
    sr_quote_revised_client: srQuoteRevisedClient,
    sr_approved_admin: srApprovedAdmin,
    sr_completed_client: srCompletedClient,
    sr_completed_admin: srCompletedAdmin,
    sr_invoice_client: srInvoiceClient,
    sr_invoice_admin: srInvoiceAdmin,

    // Self-bookings
    self_booking_created_admin: selfBookingCreatedAdmin,
    self_booking_completed_admin: selfBookingCompletedAdmin,
    self_booking_cancelled_admin: selfBookingCancelledAdmin,

    // Auth
    password_reset_otp: passwordResetOtp,

    // Line item requests
    line_item_request_submitted_admin: lineItemRequestSubmittedAdmin,
    workflow_request_submitted_admin: workflowRequestSubmittedAdmin,
    workflow_request_submitted_logistics: workflowRequestSubmittedLogistics,
    workflow_request_status_changed_admin: workflowRequestStatusChangedAdmin,
    workflow_request_status_changed_logistics: workflowRequestStatusChangedLogistics,
    workflow_request_completed_admin: workflowRequestCompletedAdmin,
    workflow_request_completed_logistics: workflowRequestCompletedLogistics,
    workflow_request_cancelled_admin: workflowRequestCancelledAdmin,
    workflow_request_cancelled_logistics: workflowRequestCancelledLogistics,
};

export function renderTemplate(
    templateKey: string,
    payload: Record<string, unknown>
): { subject: string; html: string; text: string } {
    const template = registry[templateKey];
    if (!template) throw new Error(`Unknown email template: "${templateKey}"`);
    setTemplateSupportEmail(
        typeof payload.support_email === "string" ? payload.support_email : undefined
    );
    try {
        const html = template.html(payload);
        return {
            subject: template.subject(payload),
            html,
            text: htmlToText(html),
        };
    } finally {
        clearTemplateSupportEmail();
    }
}
