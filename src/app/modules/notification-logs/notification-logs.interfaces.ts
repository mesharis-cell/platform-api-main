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
    tripType: string;
    vehicleType: string;
    finalTotalPrice?: string;
    invoiceNumber?: string;
    deliveryWindow?: string;
    pickupWindow?: string;
    orderUrl: string;
    serverUrl: string;
    supportEmail: string;
    supportPhone: string;
    pricing?: {
        warehouse_ops_rate: string;
        base_ops_total: string;
        logistics_sub_total: string;
        transport: {
            final_rate: string;
            system_rate: string;
        };
        line_items: {
            catalog_total: string;
            custom_total: string;
        };
        margin: {
            percent: string;
            amount: string;
            is_override: boolean;
            override_reason: string;
        };
        final_total: string;
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
