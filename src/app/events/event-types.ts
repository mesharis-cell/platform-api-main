// ============================================================
// Event Type Constants
// ============================================================

export const EVENT_TYPES = {
    // Order lifecycle
    ORDER_SUBMITTED: "order.submitted",
    ORDER_CANCELLED: "order.cancelled",
    ORDER_CONFIRMED: "order.confirmed",
    ORDER_READY_FOR_DELIVERY: "order.ready_for_delivery",
    ORDER_IN_TRANSIT: "order.in_transit",
    ORDER_DELIVERED: "order.delivered",
    ORDER_PICKUP_REMINDER: "order.pickup_reminder",
    ORDER_CLOSED: "order.closed",
    ORDER_TIME_WINDOWS_UPDATED: "order.time_windows_updated",

    // Quote lifecycle (order-scoped)
    QUOTE_SENT: "quote.sent",
    QUOTE_REVISED: "quote.revised",
    QUOTE_APPROVED: "quote.approved",
    QUOTE_DECLINED: "quote.declined",

    // Invoice/payment (order-scoped)
    INVOICE_GENERATED: "invoice.generated",
    PAYMENT_CONFIRMED: "payment.confirmed",

    // Fabrication/reskin (order-scoped)
    FABRICATION_COMPLETED: "fabrication.completed",

    // Inbound request lifecycle
    INBOUND_REQUEST_SUBMITTED: "inbound_request.submitted",
    INBOUND_REQUEST_QUOTED: "inbound_request.quoted",
    INBOUND_REQUEST_APPROVED: "inbound_request.approved",
    INBOUND_REQUEST_DECLINED: "inbound_request.declined",
    INBOUND_REQUEST_COMPLETED: "inbound_request.completed",
    INBOUND_REQUEST_INVOICE_GENERATED: "inbound_request.invoice_generated",

    // Service request lifecycle
    SERVICE_REQUEST_SUBMITTED: "service_request.submitted",
    SERVICE_REQUEST_QUOTED: "service_request.quoted",
    SERVICE_REQUEST_APPROVED: "service_request.approved",
    SERVICE_REQUEST_COMPLETED: "service_request.completed",
    SERVICE_REQUEST_INVOICE_GENERATED: "service_request.invoice_generated",

    // Auth
    AUTH_PASSWORD_RESET_REQUESTED: "auth.password_reset_requested",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
export type EntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "USER";

// ============================================================
// Base Payload (all events)
// ============================================================

export interface BaseEventPayload {
    entity_id_readable: string; // "ORD-20260218-001", "IR-...", "SR-..."
    company_id: string;
    company_name: string;
}

// ============================================================
// Order Event Payloads
// ============================================================

export interface OrderSubmittedPayload extends BaseEventPayload {
    contact_name: string;
    contact_email: string;
    event_start_date: string;
    event_end_date: string;
    venue_name: string;
    venue_city: string;
    item_count: number;
    total_volume: string;
    order_url: string;
}

export interface QuoteSentPayload extends BaseEventPayload {
    contact_name: string;
    contact_email: string;
    final_total: string;
    line_items: Array<{
        description: string;
        category: string;
        billing_mode: string;
        amount: number;
    }>;
    pricing: {
        base_ops_total: string;
        logistics_sub_total: string;
        margin_amount: string;
        final_total: string;
    };
    cost_estimate_url?: string;
    order_url: string;
}

export interface QuoteRevisedPayload extends BaseEventPayload {
    contact_name: string;
    previous_total: string;
    new_total: string;
    revision_reason?: string;
    order_url: string;
}

export interface QuoteApprovedPayload extends BaseEventPayload {
    contact_name: string;
    final_total: string;
    order_url: string;
}

export interface QuoteDeclinedPayload extends BaseEventPayload {
    contact_name: string;
    order_url: string;
}

export interface InvoiceGeneratedPayload extends BaseEventPayload {
    invoice_number: string;
    final_total: string;
    download_url: string;
    order_url: string;
}

export interface PaymentConfirmedPayload extends BaseEventPayload {
    invoice_number: string;
    final_total: string;
    order_url: string;
}

export interface OrderConfirmedPayload extends BaseEventPayload {
    contact_name: string;
    event_start_date: string;
    venue_name: string;
    venue_city: string;
    order_url: string;
}

export interface OrderCancelledPayload extends BaseEventPayload {
    contact_name: string;
    cancellation_reason?: string;
    cancellation_notes?: string;
    order_url: string;
}

export interface OrderReadyForDeliveryPayload extends BaseEventPayload {
    venue_name: string;
    delivery_window?: string;
    order_url: string;
}

export interface OrderInTransitPayload extends BaseEventPayload {
    contact_name: string;
    venue_name: string;
    venue_city: string;
    delivery_window?: string;
    order_url: string;
}

export interface OrderDeliveredPayload extends BaseEventPayload {
    contact_name: string;
    venue_name: string;
    pickup_window?: string;
    order_url: string;
}

export interface OrderPickupReminderPayload extends BaseEventPayload {
    contact_name: string;
    venue_name: string;
    pickup_window: string;
    order_url: string;
}

export interface OrderClosedPayload extends BaseEventPayload {
    contact_name: string;
    event_start_date: string;
    event_end_date: string;
    order_url: string;
}

export interface OrderTimeWindowsUpdatedPayload extends BaseEventPayload {
    contact_name: string;
    delivery_window?: string;
    pickup_window?: string;
    order_url: string;
}

export interface FabricationCompletedPayload extends BaseEventPayload {
    fabrication_items?: Array<{
        original_asset_name: string;
        new_asset_name: string;
        new_qr_code: string;
    }>;
    order_url: string;
}

// ============================================================
// Inbound Request Event Payloads
// ============================================================

export interface InboundRequestSubmittedPayload extends BaseEventPayload {
    contact_name: string;
    incoming_at: string;
    item_count: number;
    note?: string;
    request_url: string;
}

export interface InboundRequestQuotedPayload extends BaseEventPayload {
    contact_name: string;
    final_total: string;
    cost_estimate_url?: string;
    request_url: string;
}

export interface InboundRequestApprovedPayload extends BaseEventPayload {
    contact_name: string;
    final_total: string;
    request_url: string;
}

export interface InboundRequestDeclinedPayload extends BaseEventPayload {
    contact_name: string;
    request_url: string;
}

export interface InboundRequestCompletedPayload extends BaseEventPayload {
    contact_name: string;
    request_url: string;
}

export interface InboundRequestInvoiceGeneratedPayload extends BaseEventPayload {
    invoice_number: string;
    final_total: string;
    download_url: string;
    request_url: string;
}

// ============================================================
// Service Request Event Payloads
// ============================================================

export interface ServiceRequestSubmittedPayload extends BaseEventPayload {
    request_type: string;
    billing_mode: string;
    contact_name: string;
    request_url: string;
}

export interface ServiceRequestQuotedPayload extends BaseEventPayload {
    contact_name: string;
    final_total: string;
    request_url: string;
}

export interface ServiceRequestApprovedPayload extends BaseEventPayload {
    contact_name: string;
    final_total: string;
    request_url: string;
}

export interface ServiceRequestCompletedPayload extends BaseEventPayload {
    contact_name: string;
    request_url: string;
}

export interface ServiceRequestInvoiceGeneratedPayload extends BaseEventPayload {
    invoice_number: string;
    final_total: string;
    download_url: string;
    request_url: string;
}

// ============================================================
// Auth Event Payloads
// ============================================================

export interface AuthPasswordResetRequestedPayload {
    email: string;
    otp: string;
}

// ============================================================
// System Event (persisted)
// ============================================================

export interface SystemEvent {
    id: string;
    platform_id: string;
    event_type: EventType | string;
    entity_type: EntityType;
    entity_id: string;
    actor_id: string | null;
    actor_role: string | null;
    payload: Record<string, unknown>;
    occurred_at: Date;
    created_at: Date;
}

export interface EmitEventInput {
    platform_id: string;
    event_type: EventType | string;
    entity_type: EntityType;
    entity_id: string;
    actor_id?: string | null;
    actor_role?: string | null;
    payload: Record<string, unknown>;
}
