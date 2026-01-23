export type NotificationType =
    | "ORDER_SUBMITTED"
    | "A2_APPROVED_STANDARD"
    | "A2_ADJUSTED_PRICING"
    | "QUOTE_SENT"
    | "QUOTE_APPROVED"
    | "QUOTE_DECLINED"
    | "INVOICE_GENERATED"
    | "PAYMENT_CONFIRMED"
    | "ORDER_CONFIRMED"
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
    // Additional context fields
    // adjustmentReason?: string
    // a2AdjustedPrice?: string
    // declineReason?: string
};
