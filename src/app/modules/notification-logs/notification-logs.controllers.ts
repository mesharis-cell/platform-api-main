import { and, desc, eq, inArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { notificationLogs, systemEvents } from "../../../db/schema";
import { sendEmail } from "../../services/email.service";
import { renderTemplate } from "../../events/templates";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";

// ─── GET FAILED NOTIFICATIONS ────────────────────────────────────────────────
const getFailedNotifications = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { status, template_key, event_type, limit = "50", offset = "0" } = req.query;

    if (status && !["FAILED", "RETRYING"].includes(status as string)) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Invalid status. Must be FAILED or RETRYING",
            data: null,
        });
    }

    const statusFilter = status ? [status as string] : ["FAILED", "RETRYING"];

    const logs = await db
        .select({
            log: notificationLogs,
            event: {
                id: systemEvents.id,
                event_type: systemEvents.event_type,
                entity_type: systemEvents.entity_type,
                entity_id: systemEvents.entity_id,
                occurred_at: systemEvents.occurred_at,
            },
        })
        .from(notificationLogs)
        .innerJoin(systemEvents, eq(notificationLogs.event_id, systemEvents.id))
        .where(
            and(
                eq(notificationLogs.platform_id, platformId),
                inArray(notificationLogs.status, statusFilter as any),
                template_key
                    ? eq(notificationLogs.template_key, template_key as string)
                    : undefined,
                event_type ? eq(systemEvents.event_type, event_type as string) : undefined
            )
        )
        .orderBy(desc(notificationLogs.created_at))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

    const total = logs.length;

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Failed notifications fetched successfully",
        data: {
            notifications: logs.map(({ log, event }) => ({ ...log, event })),
            total,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
        },
    });
});

// ─── RETRY NOTIFICATION ───────────────────────────────────────────────────────
const retryNotification = catchAsync(async (req, res) => {
    const id = getRequiredString(req.params.id, "id");

    const [log] = await db.select().from(notificationLogs).where(eq(notificationLogs.id, id));

    if (!log) {
        return sendResponse(res, {
            statusCode: httpStatus.NOT_FOUND,
            success: false,
            message: "Notification log not found",
            data: null,
        });
    }

    if (!["FAILED", "RETRYING"].includes(log.status)) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: "Only FAILED or RETRYING notifications can be retried",
            data: null,
        });
    }

    // Fetch the triggering event for the payload
    const [event] = await db.select().from(systemEvents).where(eq(systemEvents.id, log.event_id));

    if (!event) {
        return sendResponse(res, {
            statusCode: httpStatus.NOT_FOUND,
            success: false,
            message: "Associated system event not found",
            data: null,
        });
    }

    // Update to RETRYING first
    await db
        .update(notificationLogs)
        .set({
            status: "RETRYING",
            attempts: log.attempts + 1,
            last_attempt_at: new Date(),
        })
        .where(eq(notificationLogs.id, id));

    let subject: string | undefined;

    try {
        const rendered = renderTemplate(log.template_key, event.payload as Record<string, unknown>);
        subject = rendered.subject;

        const messageId = await sendEmail({
            to: log.recipient_email,
            subject: rendered.subject,
            html: rendered.html,
        });

        await db
            .update(notificationLogs)
            .set({
                status: "SENT",
                sent_at: new Date(),
                message_id: messageId,
                subject,
            })
            .where(eq(notificationLogs.id, id));

        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Notification retried successfully",
            data: null,
        });
    } catch (err: any) {
        await db
            .update(notificationLogs)
            .set({
                status: "FAILED",
                error_message: err?.message || "Unknown error",
                subject: subject ?? null,
            })
            .where(eq(notificationLogs.id, id));

        sendResponse(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: "Retry failed: " + (err?.message || "Unknown error"),
            data: null,
        });
    }
});

export const NotificationLogControllers = {
    getFailedNotifications,
    retryNotification,
};
