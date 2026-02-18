/**
 * Single source of truth for event groups and their available templates.
 * Consumed by:
 *   - GET /operations/v1/notification-rules/meta  (admin UI)
 *   - seed.ts (default notification rules)
 *
 * When you add a new event type or template, update this file.
 * The admin UI will pick it up automatically on next load.
 */

export interface EventMeta {
    key: string;
    label: string;
}

export interface EventGroup {
    label: string;
    events: EventMeta[];
}

export interface TemplateMeta {
    key: string;
    label: string;
}

export const EVENT_GROUPS: EventGroup[] = [
    {
        label: "Orders",
        events: [
            { key: "order.submitted", label: "Order Submitted" },
            { key: "order.confirmed", label: "Order Confirmed" },
            { key: "order.in_transit", label: "In Transit" },
            { key: "order.delivered", label: "Delivered" },
            { key: "order.cancelled", label: "Cancelled" },
            { key: "order.closed", label: "Closed" },
            { key: "order.ready_for_delivery", label: "Ready for Delivery" },
            { key: "order.pickup_reminder", label: "Pickup Reminder" },
            { key: "order.time_windows_updated", label: "Time Windows Updated" },
        ],
    },
    {
        label: "Quotes",
        events: [
            { key: "quote.sent", label: "Quote Sent" },
            { key: "quote.revised", label: "Quote Revised" },
            { key: "quote.approved", label: "Quote Approved" },
            { key: "quote.declined", label: "Quote Declined" },
        ],
    },
    {
        label: "Invoices & Payments",
        events: [
            { key: "invoice.generated", label: "Invoice Generated" },
            { key: "payment.confirmed", label: "Payment Confirmed" },
            { key: "fabrication.completed", label: "Fabrication Completed" },
        ],
    },
    {
        label: "Inbound Requests",
        events: [
            { key: "inbound_request.submitted", label: "IR Submitted" },
            { key: "inbound_request.quoted", label: "IR Quoted" },
            { key: "inbound_request.approved", label: "IR Approved" },
            { key: "inbound_request.declined", label: "IR Declined" },
            { key: "inbound_request.completed", label: "IR Completed" },
            { key: "inbound_request.invoice_generated", label: "IR Invoice" },
        ],
    },
    {
        label: "Service Requests",
        events: [
            { key: "service_request.submitted", label: "SR Submitted" },
            { key: "service_request.quoted", label: "SR Quoted" },
            { key: "service_request.approved", label: "SR Approved" },
            { key: "service_request.completed", label: "SR Completed" },
            { key: "service_request.invoice_generated", label: "SR Invoice" },
        ],
    },
    {
        label: "Auth",
        events: [{ key: "auth.password_reset_requested", label: "Password Reset" }],
    },
];

export const TEMPLATES_BY_EVENT: Record<string, TemplateMeta[]> = {
    "order.submitted": [
        { key: "order_submitted_client", label: "Client — Order Submitted" },
        { key: "order_submitted_admin", label: "Admin — Order Submitted" },
        { key: "order_submitted_logistics", label: "Logistics — Order Submitted" },
    ],
    "order.confirmed": [
        { key: "order_confirmed_client", label: "Client — Order Confirmed" },
        { key: "order_confirmed_admin", label: "Admin — Order Confirmed" },
        { key: "order_confirmed_logistics", label: "Logistics — Order Confirmed" },
    ],
    "order.in_transit": [
        { key: "order_in_transit_client", label: "Client — In Transit" },
        { key: "order_in_transit_admin", label: "Admin — In Transit" },
    ],
    "order.delivered": [
        { key: "order_delivered_client", label: "Client — Delivered" },
        { key: "order_delivered_admin", label: "Admin — Delivered" },
        { key: "order_delivered_logistics", label: "Logistics — Delivered" },
    ],
    "order.cancelled": [
        { key: "order_cancelled_client", label: "Client — Cancelled" },
        { key: "order_cancelled_admin", label: "Admin — Cancelled" },
        { key: "order_cancelled_logistics", label: "Logistics — Cancelled" },
    ],
    "order.closed": [{ key: "order_closed_admin", label: "Admin — Order Closed" }],
    "order.ready_for_delivery": [{ key: "order_ready_admin", label: "Admin — Ready for Delivery" }],
    "order.pickup_reminder": [
        { key: "pickup_reminder_client", label: "Client — Pickup Reminder" },
        { key: "pickup_reminder_admin", label: "Admin — Pickup Reminder" },
        { key: "pickup_reminder_logistics", label: "Logistics — Pickup Reminder" },
    ],
    "order.time_windows_updated": [
        { key: "time_windows_updated_client", label: "Client — Time Windows Updated" },
        { key: "time_windows_updated_admin", label: "Admin — Time Windows Updated" },
    ],
    "quote.sent": [
        { key: "quote_sent_client", label: "Client — Quote Sent" },
        { key: "quote_sent_admin", label: "Admin — Quote Sent" },
    ],
    "quote.revised": [
        { key: "quote_revised_client", label: "Client — Quote Revised" },
        { key: "quote_revised_admin", label: "Admin — Quote Revised" },
    ],
    "quote.approved": [
        { key: "quote_approved_admin", label: "Admin — Quote Approved" },
        { key: "quote_approved_logistics", label: "Logistics — Quote Approved" },
    ],
    "quote.declined": [
        { key: "quote_declined_admin", label: "Admin — Quote Declined" },
        { key: "quote_declined_logistics", label: "Logistics — Quote Declined" },
    ],
    "invoice.generated": [
        { key: "invoice_generated_client", label: "Client — Invoice Generated" },
        { key: "invoice_generated_admin", label: "Admin — Invoice Generated" },
    ],
    "payment.confirmed": [
        { key: "payment_confirmed_admin", label: "Admin — Payment Confirmed" },
        { key: "payment_confirmed_logistics", label: "Logistics — Payment Confirmed" },
    ],
    "fabrication.completed": [
        { key: "fabrication_completed_admin", label: "Admin — Fabrication Completed" },
        { key: "fabrication_completed_logistics", label: "Logistics — Fabrication Completed" },
    ],
    "inbound_request.submitted": [
        { key: "ir_submitted_client", label: "Client — IR Submitted" },
        { key: "ir_submitted_admin", label: "Admin — IR Submitted" },
        { key: "ir_submitted_logistics", label: "Logistics — IR Submitted" },
    ],
    "inbound_request.quoted": [{ key: "ir_quoted_client", label: "Client — IR Quoted" }],
    "inbound_request.approved": [
        { key: "ir_approved_admin", label: "Admin — IR Approved" },
        { key: "ir_approved_logistics", label: "Logistics — IR Approved" },
    ],
    "inbound_request.declined": [],
    "inbound_request.completed": [{ key: "ir_completed_client", label: "Client — IR Completed" }],
    "inbound_request.invoice_generated": [
        { key: "ir_invoice_client", label: "Client — IR Invoice" },
        { key: "ir_invoice_admin", label: "Admin — IR Invoice" },
    ],
    "service_request.submitted": [
        { key: "sr_submitted_admin", label: "Admin — SR Submitted" },
        { key: "sr_submitted_logistics", label: "Logistics — SR Submitted" },
    ],
    "service_request.quoted": [{ key: "sr_quoted_client", label: "Client — SR Quoted" }],
    "service_request.approved": [{ key: "sr_approved_admin", label: "Admin — SR Approved" }],
    "service_request.completed": [
        { key: "sr_completed_client", label: "Client — SR Completed" },
        { key: "sr_completed_admin", label: "Admin — SR Completed" },
    ],
    "service_request.invoice_generated": [
        { key: "sr_invoice_client", label: "Client — SR Invoice" },
        { key: "sr_invoice_admin", label: "Admin — SR Invoice" },
    ],
    "auth.password_reset_requested": [
        { key: "password_reset_otp", label: "User — Password Reset OTP" },
    ],
};
