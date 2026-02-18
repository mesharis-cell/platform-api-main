import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../db";
import { cities, lineItems, prices, users } from "../../../db/schema";
import config from "../../config";
import { sendEmail } from "../../services/email.service";
import { formatDateForEmail, formatTimeWindow } from "../../utils/date-time";
import {
    NotificationData,
    NotificationRecipients,
    NotificationType,
} from "./notification-logs.interfaces";

// ----------------------------------- GET NOTIFICATION TYPE FOR TRANSITION -----------------------
export function getNotificationTypeForTransition(
    fromStatus: string,
    toStatus: string
): string | null {
    // Map status transitions to notification types
    const transitionMap: Record<string, string> = {
        "DRAFT->SUBMITTED": "ORDER_SUBMITTED",
        "SUBMITTED->PRICING_REVIEW": "", // No notification needed
        "PRICING_REVIEW->PENDING_APPROVAL": "", // No notification needed
        "PENDING_APPROVAL->QUOTED": "QUOTE_SENT", // Admin approved, send to client
        "QUOTED->CONFIRMED": "QUOTE_APPROVED", // Direct to CONFIRMED
        "QUOTED->DECLINED": "QUOTE_DECLINED",
        "CONFIRMED->IN_PREPARATION": "ORDER_CONFIRMED",
        "IN_PREPARATION->READY_FOR_DELIVERY": "READY_FOR_DELIVERY",
        "READY_FOR_DELIVERY->IN_TRANSIT": "IN_TRANSIT",
        "IN_TRANSIT->DELIVERED": "DELIVERED",
        "DELIVERED->IN_USE": "", // No notification needed
        "IN_USE->AWAITING_RETURN": "", // No notification needed (PICKUP_REMINDER sent via cron 48h before)
        "RETURN_IN_TRANSIT->CLOSED": "ORDER_CLOSED",
    };

    const key = `${fromStatus}->${toStatus}`;
    const notificationType = transitionMap[key];

    // Return null if empty string (no notification) or undefined (not in map)
    return notificationType && notificationType !== "" ? notificationType : null;
}

// ----------------------------------- GET RECIPIENTS FOR NOTIFICATION ----------------------------
export const getRecipientsForNotification = async (
    platformId: string,
    notificationType: NotificationType,
    clientEmail: string
): Promise<NotificationRecipients> => {
    // Get Admins
    const admins = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(
                eq(users.platform_id, platformId),
                eq(users.role, "ADMIN"),
                sql`${users.email} NOT LIKE '%@system.internal'`
            )
        );

    const adminEmails = admins.map((a) => a.email);
    console.log(`   📋 Found ${adminEmails.length} Admin(s): ${adminEmails.join(", ") || "none"}`);

    // Get Logistics
    const logistics = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(
                eq(users.platform_id, platformId),
                eq(users.role, "LOGISTICS"),
                sql`${users.email} NOT LIKE '%@system.internal'`
            )
        );

    const logisticsEmails = logistics.map((s) => s.email);
    console.log(
        `   📋 Found ${logisticsEmails.length} Logistics: ${logisticsEmails.join(", ") || "none"}`
    );

    // Client email
    console.log(`   📋 Client email: ${clientEmail || "not set"}`);

    // Notification Matrix (based on req.md Email Notification Matrix)
    const matrix: Record<NotificationType, NotificationRecipients> = {
        ORDER_SUBMITTED: { to: [clientEmail], cc: [...adminEmails, ...logisticsEmails] },
        QUOTE_SENT: { to: [clientEmail], cc: adminEmails },
        QUOTE_REVISED: { to: [clientEmail], cc: adminEmails },
        QUOTE_APPROVED: { to: [...adminEmails, ...logisticsEmails] }, // PMG + A2, no CC to client
        QUOTE_DECLINED: { to: [...adminEmails, ...logisticsEmails] }, // PMG + A2, no CC to client
        INVOICE_GENERATED: { to: [clientEmail], cc: adminEmails },
        PAYMENT_CONFIRMED: {
            to: [...adminEmails, ...logisticsEmails],
        }, // PMG + A2, no CC to client
        ORDER_CONFIRMED: { to: [...adminEmails, ...logisticsEmails, clientEmail] },
        ORDER_CANCELLED: { to: [...adminEmails, ...logisticsEmails] },
        FABRICATION_COMPLETE: { to: logisticsEmails, cc: adminEmails },
        READY_FOR_DELIVERY: { to: adminEmails }, // PMG only (FYI) - no CC to A2
        IN_TRANSIT: { to: [clientEmail], cc: [...adminEmails] }, // Client + PMG FYI, no A2
        DELIVERED: { to: [...adminEmails, ...logisticsEmails, clientEmail] },
        PICKUP_REMINDER: { to: [...adminEmails, ...logisticsEmails, clientEmail] },
        ORDER_CLOSED: { to: adminEmails }, // PMG only, no CC to A2
        TIME_WINDOWS_UPDATED: { to: [clientEmail, ...adminEmails] },
    };

    return matrix[notificationType];
};

// ----------------------------------- BUILD NOTIFICATION DATA ------------------------------------
export const buildNotificationData = async (order: any): Promise<NotificationData> => {
    const clientUrl = config.client_url;
    const serverUrl = config.server_url;

    const orderPricing = await db.query.prices.findFirst({
        where: and(
            eq(prices.id, order.order_pricing_id),
            eq(prices.platform_id, order.platform_id)
        ),
    });

    const venueCity = await db.query.cities.findFirst({
        where: and(eq(cities.id, order.venue_city_id), eq(cities.platform_id, order.platform_id)),
    });

    const lineItemsData = await db
        .select({
            description: lineItems.description,
            total: lineItems.total,
            category: lineItems.category,
            billing_mode: lineItems.billing_mode,
        })
        .from(lineItems)
        .where(
            and(
                eq(lineItems.order_id, order.id),
                eq(lineItems.is_voided, false),
                inArray(lineItems.billing_mode, ["BILLABLE", "COMPLIMENTARY"])
            )
        );

    return {
        platformId: order.platform_id,
        orderId: order.id,
        orderIdReadable: order.order_id,
        companyName: order.company?.name || "Unknown Company",
        contactName: order.contact_name || "Valued Customer",
        eventStartDate: order.event_start_date
            ? formatDateForEmail(new Date(order.event_start_date))
            : "",
        eventEndDate: order.event_end_date
            ? formatDateForEmail(new Date(order.event_end_date))
            : "",
        venueName: order.venue_name || "",
        venueCity: venueCity?.name || "",
        finalTotalPrice: orderPricing?.final_total
            ? Number(orderPricing.final_total).toFixed(2)
            : "",
        invoiceNumber: order.invoiceNumber || "",
        deliveryWindow: formatTimeWindow(order.delivery_window?.start, order.delivery_window?.end),
        pickupWindow: formatTimeWindow(order.pickup_window?.start, order.pickup_window?.end),
        orderUrl: `${clientUrl}/orders/${order.order_id}`,
        serverUrl: serverUrl,
        supportEmail: "support@assetfulfillment.com",
        supportPhone: "+971 XX XXX XXXX",
        pricing: orderPricing
            ? {
                  warehouse_ops_rate: orderPricing.warehouse_ops_rate?.toString() || "N/A",
                  base_ops_total: orderPricing.base_ops_total?.toString() || "N/A",
                  logistics_sub_total: orderPricing.logistics_sub_total?.toString() || "N/A",
                  line_items: {
                      catalog_total:
                          (orderPricing.line_items as any)?.catalog_total?.toString() || "N/A",
                      custom_total:
                          (orderPricing.line_items as any)?.custom_total?.toString() || "N/A",
                  },
                  margin: {
                      percent: (orderPricing.margin as any)?.percent?.toString() || "N/A",
                      amount: (orderPricing.margin as any)?.amount?.toString() || "N/A",
                      is_override: (orderPricing.margin as any)?.is_override || false,
                      override_reason: (orderPricing.margin as any)?.override_reason || "",
                  },
                  final_total: orderPricing.final_total?.toString() || "N/A",
              }
            : undefined,
        line_items: lineItemsData.map((item) => {
            const rawItem = item as Record<string, unknown>;
            const amount = Number(
                rawItem.sell_total ?? rawItem.total_sell_price ?? item.total ?? 0
            );
            return {
                description: item.description,
                category: item.category,
                billing_mode: item.billing_mode || "BILLABLE",
                total: Number(item.total),
                amount: Number.isFinite(amount) ? amount : 0,
            };
        }),
    };
};

// ----------------------------------- SEND EMAIL WITH LOGGING ------------------------------------
export async function sendEmailWithLogging(
    to: string,
    subject: string,
    html: string
): Promise<string> {
    // TODO
    // In development, log email instead of sending
    // if (config.node_env === 'development') {
    //     console.log('='.repeat(80))
    //     console.log('EMAIL (Development Mode - Not Sent)')
    //     console.log('='.repeat(80))
    //     console.log('To:', to)
    //     console.log('Subject:', subject)
    //     console.log('='.repeat(80))
    //     return 'dev-message-id-' + Date.now()
    // }

    // In production, send via Nodemailer
    const messageId = await sendEmail({
        to,
        subject,
        html,
    });

    return messageId;
}
