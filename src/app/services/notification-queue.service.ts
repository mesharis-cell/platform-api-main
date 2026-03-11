import os from "node:os";
import { and, eq, sql } from "drizzle-orm";
import config from "../config";
import { db } from "../../db";
import { notificationLogs, systemEvents } from "../../db/schema";
import { sendEmail } from "./email.service";
import { renderTemplate } from "../events/templates";
import {
    getPlatformEmailSettings,
    injectDeepLink,
    type NotificationDispatchTarget,
} from "../events/handlers/email.handler";
import { EmailSuppressionService } from "./email-suppression.service";
import { EmailPreferencesService } from "./email-preferences.service";

type ClaimedNotificationLog = {
    id: string;
    platform_id: string;
    event_id: string;
    recipient_email: string;
    recipient_type: "ROLE" | "ENTITY_OWNER" | "EMAIL";
    recipient_value: string | null;
    template_key: string;
    attempts: number;
};

type RetryDecision = {
    retryable: boolean;
    delayMs?: number;
};

const workerId = `${os.hostname()}-${process.pid}`;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getPerRequestDelayMs = () =>
    Math.max(1, Math.ceil(1000 / Math.max(1, config.email_rate_limit_per_second)));

const getRetryDelayMs = (attempts: number) => {
    if (attempts <= 1) return 2_000;
    if (attempts === 2) return 5_000;
    if (attempts === 3) return 15_000;
    return Math.min(300_000, 15_000 * 2 ** Math.max(0, attempts - 3));
};

const appendHtmlFooter = (html: string, unsubscribeUrl: string, supportEmail: string) => {
    const footer = `<div style="max-width:600px;margin:0 auto;padding:0 24px 24px;color:#666;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">
  <p style="margin:16px 0 8px;">If you no longer want to receive these emails, <a href="${unsubscribeUrl}" style="color:#2563eb;">unsubscribe here</a>.</p>
  <p style="margin:0;">Need help? Contact <a href="mailto:${supportEmail}" style="color:#2563eb;">${supportEmail}</a>.</p>
</div>`;

    if (html.includes("</body>")) {
        return html.replace("</body>", `${footer}</body>`);
    }

    return `${html}${footer}`;
};

const appendTextFooter = (text: string, unsubscribeUrl: string, supportEmail: string) =>
    `${text}\n\nUnsubscribe: ${unsubscribeUrl}\nSupport: ${supportEmail}`;

const getErrorMetadata = (error: unknown) => {
    const err = error as Error & {
        statusCode?: number;
        status?: number;
        code?: string;
        message?: string;
    };

    return {
        statusCode: err?.statusCode ?? err?.status,
        code: err?.code,
        message: err?.message || "Unknown error",
    };
};

const classifySendFailure = (error: unknown, attempts: number): RetryDecision => {
    const { statusCode, code, message } = getErrorMetadata(error);
    const normalized = message.toLowerCase();

    const retryableTransportCodes = new Set([
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "EAI_AGAIN",
        "ENOTFOUND",
    ]);

    if (statusCode === 429 || normalized.includes("too many requests")) {
        return { retryable: true, delayMs: getRetryDelayMs(attempts) };
    }

    if ((statusCode && statusCode >= 500) || retryableTransportCodes.has(code || "")) {
        return { retryable: true, delayMs: getRetryDelayMs(attempts) };
    }

    return { retryable: false };
};

const recoverStaleProcessingLogs = async () => {
    const timeoutSeconds = config.email_processing_timeout_seconds;

    const recovered = await db
        .update(notificationLogs)
        .set({
            status: "RETRYING",
            next_attempt_at: new Date(),
            processing_started_at: null,
            worker_id: null,
            error_message: "Recovered stale processing notification",
        })
        .where(
            and(
                eq(notificationLogs.status, "PROCESSING"),
                sql`${notificationLogs.processing_started_at} <= NOW() - (${timeoutSeconds} * INTERVAL '1 second')`
            )
        )
        .returning({ id: notificationLogs.id });

    if (recovered.length > 0) {
        console.log(
            `[NotificationWorker] Recovered ${recovered.length} stale processing notification(s)`
        );
    }
};

const claimQueuedNotifications = async (): Promise<ClaimedNotificationLog[]> => {
    const batchSize = Math.max(
        1,
        Math.min(config.email_worker_batch_size, config.email_rate_limit_per_second)
    );

    const result = (await db.execute(sql`
        WITH candidates AS (
            SELECT id
            FROM notification_logs
            WHERE status IN ('QUEUED', 'RETRYING')
              AND COALESCE(next_attempt_at, created_at) <= NOW()
            ORDER BY COALESCE(next_attempt_at, created_at), created_at
            FOR UPDATE SKIP LOCKED
            LIMIT ${batchSize}
        )
        UPDATE notification_logs AS nl
        SET status = 'PROCESSING',
            attempts = nl.attempts + 1,
            last_attempt_at = NOW(),
            processing_started_at = NOW(),
            worker_id = ${workerId}
        FROM candidates
        WHERE nl.id = candidates.id
        RETURNING
            nl.id,
            nl.platform_id,
            nl.event_id,
            nl.recipient_email,
            nl.recipient_type,
            nl.recipient_value,
            nl.template_key,
            nl.attempts;
    `)) as { rows: ClaimedNotificationLog[] };

    return result.rows;
};

const markNotificationSent = async (id: string, messageId: string, subject: string) => {
    await db
        .update(notificationLogs)
        .set({
            status: "SENT",
            sent_at: new Date(),
            message_id: messageId,
            subject,
            next_attempt_at: null,
            processing_started_at: null,
            worker_id: workerId,
            error_message: null,
        })
        .where(eq(notificationLogs.id, id));
};

const markNotificationFailed = async (id: string, message: string, subject?: string) => {
    await db
        .update(notificationLogs)
        .set({
            status: "FAILED",
            error_message: message,
            subject: subject ?? null,
            processing_started_at: null,
            worker_id: workerId,
            next_attempt_at: null,
        })
        .where(eq(notificationLogs.id, id));
};

const markNotificationSkipped = async (id: string, message: string, subject?: string) => {
    await db
        .update(notificationLogs)
        .set({
            status: "SKIPPED",
            error_message: message,
            subject: subject ?? null,
            processing_started_at: null,
            worker_id: workerId,
            next_attempt_at: null,
        })
        .where(eq(notificationLogs.id, id));
};

const scheduleNotificationRetry = async (
    id: string,
    message: string,
    delayMs: number,
    subject?: string
) => {
    await db
        .update(notificationLogs)
        .set({
            status: "RETRYING",
            error_message: message,
            subject: subject ?? null,
            processing_started_at: null,
            worker_id: null,
            next_attempt_at: new Date(Date.now() + delayMs),
        })
        .where(eq(notificationLogs.id, id));
};

const processClaimedNotification = async (log: ClaimedNotificationLog) => {
    const [event] = await db.select().from(systemEvents).where(eq(systemEvents.id, log.event_id));

    if (!event) {
        await markNotificationFailed(log.id, "Associated system event not found");
        return;
    }

    const eventCompanyId =
        event.entity_type === "USER"
            ? null
            : String((event.payload as Record<string, unknown>)?.company_id || "") || null;

    const dispatchTarget: NotificationDispatchTarget = {
        recipient_type: log.recipient_type,
        recipient_value: log.recipient_value,
        template_key: log.template_key,
    };

    let subject: string | undefined;

    try {
        const isSuppressed = await EmailSuppressionService.isSuppressed(
            log.platform_id,
            log.recipient_email
        );
        if (isSuppressed) {
            await markNotificationSkipped(log.id, "Recipient unsubscribed from future emails");
            console.log(
                `[NotificationWorker] Skipped suppressed recipient ${log.recipient_email} (${log.id})`
            );
            return;
        }

        const resolvedPayload = await injectDeepLink(dispatchTarget, event as any, eventCompanyId);
        const rendered = renderTemplate(log.template_key, resolvedPayload);
        subject = rendered.subject;
        const emailSettings = await getPlatformEmailSettings(log.platform_id);
        const unsubscribe = EmailPreferencesService.buildUnsubscribeUrl(
            log.platform_id,
            log.recipient_email
        );
        const html = unsubscribe.url
            ? appendHtmlFooter(rendered.html, unsubscribe.url, emailSettings.supportEmail)
            : rendered.html;
        const text = unsubscribe.url
            ? appendTextFooter(rendered.text, unsubscribe.url, emailSettings.supportEmail)
            : rendered.text;
        const headers: Record<string, string> = {
            "X-Entity-Ref-ID": String(
                (resolvedPayload.entity_id_readable as string | undefined) ||
                    event.entity_id ||
                    log.id
            ),
        };
        if (unsubscribe.url) {
            headers["List-Unsubscribe"] = `<${unsubscribe.url}>`;
            headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        }
        const messageId = await sendEmail({
            to: log.recipient_email,
            subject: rendered.subject,
            html,
            text,
            from: emailSettings.fromEmail,
            replyTo: emailSettings.supportEmail || config.email_reply_to || emailSettings.fromEmail,
            headers,
        });

        await markNotificationSent(log.id, messageId, rendered.subject);
        console.log(
            `[NotificationWorker] Sent ${log.template_key} to ${log.recipient_email} (${log.id})`
        );
    } catch (error) {
        const decision = classifySendFailure(error, log.attempts);
        const { message } = getErrorMetadata(error);

        if (decision.retryable && log.attempts < config.email_max_attempts) {
            await scheduleNotificationRetry(log.id, message, decision.delayMs || 2_000, subject);
            console.warn(
                `[NotificationWorker] Retry scheduled for ${log.recipient_email} in ${decision.delayMs}ms (${log.id})`
            );
            return;
        }

        await markNotificationFailed(log.id, message, subject);
        console.error(
            `[NotificationWorker] Permanent failure for ${log.recipient_email} (${log.id}): ${message}`
        );
    }
};

const processNotificationQueue = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
        const jobs = await claimQueuedNotifications();
        if (jobs.length === 0) return;

        console.log(`[NotificationWorker] Claimed ${jobs.length} notification(s)`);

        const perRequestDelayMs = getPerRequestDelayMs();
        for (let index = 0; index < jobs.length; index += 1) {
            await processClaimedNotification(jobs[index]);
            if (index < jobs.length - 1) {
                await wait(perRequestDelayMs);
            }
        }
    } catch (error) {
        console.error("[NotificationWorker] Queue processing failed:", error);
    } finally {
        isProcessing = false;
    }
};

export const NotificationQueueService = {
    async start() {
        if (workerTimer) return;

        console.log(`[NotificationWorker] Starting worker ${workerId}`);
        await recoverStaleProcessingLogs();
        await processNotificationQueue();
        workerTimer = setInterval(() => {
            void processNotificationQueue();
        }, 1_000);
    },
};
