import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import { notificationLogs } from "../../../db/schema";
import { getEmailTemplate } from "../../utils/email-template";
import { NotificationRecipients, NotificationType } from "./notification-logs.interfaces";
import { buildNotificationData, getRecipientsForNotification, sendEmailWithLogging } from "./notification-logs.utils";

const sendNotification = async (
    platformId: string,
    notificationType: NotificationType,
    order: any,
    overrideRecipients?: Partial<NotificationRecipients>
) => {
    // Step 1: Determine recipients (use override or fetch based on notification type)
    const recipients =
        overrideRecipients ||
        (await getRecipientsForNotification(platformId, notificationType, order));

    // Step 2: Build notification data from order details
    const data = await buildNotificationData(order);

    // Step 3: Get email template (subject and HTML content)
    const { subject, html } = await getEmailTemplate(notificationType, data)

    // Step 4: Create notification log entry with QUEUED status
    const [logEntry] = await db
        .insert(notificationLogs)
        .values({
            platform_id: platformId,
            order_id: order.id,
            notification_type: notificationType,
            recipients: JSON.stringify(recipients),
            status: 'QUEUED',
            attempts: 1,
        })
        .returning()

    // Step 5: Validate recipients exist
    if (!recipients.to) {
        console.log(
            `   ✖ No recipients found for notification type: ${notificationType}`
        )
        return
    }

    let messageId = ''
    // Step 6: Send email to all primary recipients
    for (const toEmail of recipients.to) {
        const messageIdRes = await sendEmailWithLogging(
            toEmail,
            subject,
            html
        )

        messageId = messageIdRes
    }

    // Step 7: Update notification log status to SENT
    await db
        .update(notificationLogs)
        .set({
            status: 'SENT',
            sent_at: new Date(),
            message_id: messageId,
        })
        .where(eq(notificationLogs.id, logEntry.id))

    // Step 8: Send CC emails if any exist
    if (recipients.cc && recipients.cc.length > 0) {
        for (const ccEmail of recipients.cc) {
            const ccMessageId = await sendEmailWithLogging(
                ccEmail,
                subject,
                html
            )
            console.log(
                `   ✓ CC sent to: ${ccEmail} (Message ID: ${ccMessageId})`
            )
        }
    }

    // Step 9: Log successful notification completion
    console.log(
        `✅ Notification sent: ${notificationType} for order ${order.order_id} (Total: ${recipients.to.length} primary, ${recipients.cc?.length || 0} CC)`
    )
};

// ----------------------------------- GET FAILED NOTIFICATIONS -----------------------------------
const getFailedNotifications = async (
    platformId: string,
    filters?: {
        status?: 'FAILED' | 'RETRYING';
        notification_type?: string;
        order_id?: string;
        limit?: number;
        offset?: number;
    }
) => {
    const conditions = [
        eq(notificationLogs.platform_id, platformId),
    ];

    // Filter by status (default to FAILED or RETRYING)
    if (filters?.status) {
        conditions.push(eq(notificationLogs.status, filters.status));
    } else {
        conditions.push(
            or(
                eq(notificationLogs.status, 'FAILED'),
                eq(notificationLogs.status, 'RETRYING')
            )!
        );
    }

    // Filter by notification type
    if (filters?.notification_type) {
        conditions.push(eq(notificationLogs.notification_type, filters.notification_type));
    }

    // Filter by order ID
    if (filters?.order_id) {
        conditions.push(eq(notificationLogs.order_id, filters.order_id));
    }

    // Get notifications with order details
    const notifications = await db.query.notificationLogs.findMany({
        where: and(...conditions),
        with: {
            order: {
                with: {
                    company: true,
                },
            },
        },
        orderBy: desc(notificationLogs.created_at),
        limit: filters?.limit || 50,
        offset: filters?.offset || 0,
    });

    // Get total count
    const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(notificationLogs)
        .where(and(...conditions));

    const total = Number(totalResult[0].count);

    return {
        notifications: notifications.map((n) => ({
            id: n.id,
            order: {
                id: n.order.id,
                orderId: n.order.order_id,
                companyName: n.order.company?.name || "Unknown",
            },
            notificationType: n.notification_type,
            recipients: JSON.parse(n.recipients),
            status: n.status,
            attempts: n.attempts,
            lastAttemptAt: n.last_attempt_at,
            errorMessage: n.error_message,
            createdAt: n.created_at,
        })),
        total,
    };
};

export const NotificationLogServices = {
    sendNotification,
    getFailedNotifications,
}