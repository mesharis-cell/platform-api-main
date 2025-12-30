import { and, eq, sql } from "drizzle-orm"
import { db } from "../../../db"
import { users } from "../../../db/schema"
import config from "../../config"
import { sendEmail } from "../../services/email.service"
import { formatDateForEmail, formatTimeWindow } from "../../utils/date-time"
import { NotificationData, NotificationRecipients, NotificationType } from "./notification-logs.interfaces"

// ----------------------------------- GET NOTIFICATION TYPE FOR TRANSITION --------------------
/**
 * Maps status transitions to notification types
 */
export function getNotificationTypeForTransition(
    fromStatus: string,
    toStatus: string
): string | null {
    // Map status transitions to notification types
    const transitionMap: Record<string, string> = {
        'DRAFT->SUBMITTED': 'ORDER_SUBMITTED',
        'SUBMITTED->PRICING_REVIEW': '', // No notification needed
        'PRICING_REVIEW->QUOTED': 'QUOTE_SENT', // A2 approved standard pricing, goes direct to client
        'PRICING_REVIEW->PENDING_APPROVAL': 'A2_ADJUSTED_PRICING', // A2 adjusted price, needs PMG review
        'PENDING_APPROVAL->QUOTED': 'QUOTE_SENT', // PMG approved, send to client
        'QUOTED->CONFIRMED': 'QUOTE_APPROVED', // Direct to CONFIRMED
        'QUOTED->DECLINED': 'QUOTE_DECLINED',
        'CONFIRMED->IN_PREPARATION': 'ORDER_CONFIRMED',
        'IN_PREPARATION->READY_FOR_DELIVERY': 'READY_FOR_DELIVERY',
        'READY_FOR_DELIVERY->IN_TRANSIT': 'IN_TRANSIT',
        'IN_TRANSIT->DELIVERED': 'DELIVERED',
        'DELIVERED->IN_USE': '', // No notification needed
        'IN_USE->AWAITING_RETURN': '', // No notification needed (PICKUP_REMINDER sent via cron 48h before)
        'AWAITING_RETURN->CLOSED': 'ORDER_CLOSED',
    };

    const key = `${fromStatus}->${toStatus}`;
    const notificationType = transitionMap[key];

    // Return null if empty string (no notification) or undefined (not in map)
    return notificationType && notificationType !== '' ? notificationType : null;
}

export const getRecipientsForNotification = async (
    notificationType: NotificationType,
    order: any
): Promise<NotificationRecipients> => {
    // Get Admins
    const admins = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(
                eq(users.role, 'ADMIN'),
                sql`${users.email} NOT LIKE '%@system.internal'`
            )
        )

    const adminEmails = admins.map(a => a.email)
    console.log(
        `   📋 Found ${adminEmails.length} Admin(s): ${adminEmails.join(', ') || 'none'}`
    )

    // Get Logistics
    const logistics = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(
                eq(users.role, 'LOGISTICS'),
                sql`${users.email} NOT LIKE '%@system.internal'`
            )
        )

    const logisticsEmails = logistics.map(s => s.email)
    console.log(
        `   📋 Found ${logisticsEmails.length} Logistics: ${logisticsEmails.join(', ') || 'none'}`
    )

    // Client email
    const clientEmail = order.contact_email
    console.log(`   📋 Client email: ${clientEmail || 'not set'}`)

    // Notification Matrix (based on req.md Email Notification Matrix)
    const matrix: Record<NotificationType, NotificationRecipients> = {
        ORDER_SUBMITTED: { to: [clientEmail], cc: [...adminEmails, ...logisticsEmails] },
        A2_APPROVED_STANDARD: { to: adminEmails }, // PMG only (FYI) - no CC to A2
        A2_ADJUSTED_PRICING: { to: adminEmails }, // PMG only (Action Required) - no CC to A2
        QUOTE_SENT: { to: [clientEmail], cc: adminEmails },
        QUOTE_APPROVED: { to: [...adminEmails, ...logisticsEmails] }, // PMG + A2, no CC to client
        QUOTE_DECLINED: { to: [...adminEmails, ...logisticsEmails] }, // PMG + A2, no CC to client
        INVOICE_GENERATED: { to: [clientEmail], cc: adminEmails },
        PAYMENT_CONFIRMED: {
            to: [...adminEmails, ...logisticsEmails],
        }, // PMG + A2, no CC to client
        ORDER_CONFIRMED: { to: [...adminEmails, ...logisticsEmails, clientEmail] },
        READY_FOR_DELIVERY: { to: adminEmails }, // PMG only (FYI) - no CC to A2
        IN_TRANSIT: { to: [clientEmail], cc: [...adminEmails] }, // Client + PMG FYI, no A2
        DELIVERED: { to: [...adminEmails, ...logisticsEmails, clientEmail] },
        PICKUP_REMINDER: { to: [...adminEmails, ...logisticsEmails, clientEmail] },
        ORDER_CLOSED: { to: adminEmails }, // PMG only, no CC to A2
        TIME_WINDOWS_UPDATED: { to: [clientEmail, ...adminEmails] },
    }

    return matrix[notificationType]
}

export const buildNotificationData = async (order: any): Promise<NotificationData> => {
    const baseUrl = config.frontend_url || 'http://localhost:3000'

    return {
        orderId: order.id,
        orderIdReadable: order.order_id,
        companyName: order.company?.name || 'Unknown Company',
        contactName: order.contact_name || 'Valued Customer',
        eventStartDate: order.event_start_date
            ? formatDateForEmail(new Date(order.event_start_date))
            : '',
        eventEndDate: order.event_end_date
            ? formatDateForEmail(new Date(order.event_end_date))
            : '',
        venueName: order.venue_name || '',
        venueCity: order.venue_location?.city || '',
        finalTotalPrice: order.final_pricing?.total_price
            ? Number(order.final_pricing.total_price).toFixed(2)
            : '',
        invoiceNumber: order.invoice_id || '',
        deliveryWindow: formatTimeWindow(
            order.delivery_window?.start,
            order.delivery_window?.end
        ),
        pickupWindow: formatTimeWindow(
            order.pickup_window?.start,
            order.pickup_window?.end
        ),
        orderUrl: `${baseUrl}/orders/${order.order_id}`,
        supportEmail: 'support@assetfulfillment.com',
        supportPhone: '+971 XX XXX XXXX',
        // Additional fields for enhanced templates
        // adjustmentReason: order.a2_adjustment_reason || undefined,
        // a2AdjustedPrice: order.a2_adjusted_price
        //     ? Number(order.a2_adjusted_price).toFixed(2)
        //     : undefined,
        // declineReason: order.declineReason || undefined,
    }
}

export async function sendEmailWithLogging(
    to: string,
    subject: string,
    html: string
) {
    // In development, log email instead of sending
    if (config.node_env === 'development') {
        console.log('='.repeat(80))
        console.log('EMAIL (Development Mode - Not Sent)')
        console.log('='.repeat(80))
        console.log('To:', to)
        console.log('Subject:', subject)
        console.log('='.repeat(80))
        return 'dev-message-id-' + Date.now()
    }

    // In production, send via Resend
    await sendEmail({
        to,
        subject,
        html,
    })
}