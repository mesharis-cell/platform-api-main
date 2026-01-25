export type NotificationType =
    | "ORDER_SUBMITTED"
    | "A2_APPROVED_STANDARD"
    | "A2_ADJUSTED_PRICING"
    | "QUOTE_SENT"
    | "QUOTE_APPROVED"
    | "QUOTE_DECLINED"
    | "QUOTE_REVISED"
    | "INVOICE_GENERATED"
    | "PAYMENT_CONFIRMED"
    | "ORDER_CONFIRMED"
    | "ORDER_CANCELLED"
    | "FABRICATION_COMPLETE"
    | "READY_FOR_DELIVERY"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "PICKUP_REMINDER"
    | "ORDER_CLOSED"
    | "TIME_WINDOWS_UPDATED";

export type NotificationRecipients = {
    to: string[];
    cc?: string[];
    bcc?: string[];
};

export type NotificationData = {
    platformId: string;
    orderId: string;
    orderIdReadable: string;
    companyName: string;
    contactName: string;
    eventStartDate?: string;
    eventEndDate?: string;
    venueName?: string;
    venueCity?: string;
    finalTotalPrice?: string;
    invoiceNumber?: string;
    deliveryWindow?: string;
    pickupWindow?: string;
    orderUrl: string;
    serverUrl: string;
    supportEmail: string;
    supportPhone: string;
    pricing?: {
        base_operations?: { volume: number; rate: number; total: number };
        transport?: { emirate: string; trip_type: string; vehicle_type: string; final_rate: number };
        line_items?: { catalog_total: number; custom_total: number };
        logistics_subtotal?: number;
        margin?: { percent: number; amount: number };
        final_total?: number;
    };
    line_items?: Array<{ description: string; total: number; category: string }>;
    cancellation_reason?: string;
    cancellation_notes?: string;
    previous_total?: number | string | null;
    new_total?: number | string | null;
    revision_reason?: string;
    fabrication_items?: Array<{
        original_asset_name: string;
        new_asset_name: string;
        new_qr_code: string;
    }>;
    // Additional context fields
    // adjustmentReason?: string
    // a2AdjustedPrice?: string
    // declineReason?: string
};
