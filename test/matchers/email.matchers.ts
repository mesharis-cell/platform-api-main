import { and, eq } from "drizzle-orm";
import { db } from "../support/db";
import { notificationLogs, systemEvents } from "../../src/db/schema";

type MatcherResult = { pass: boolean; message: () => string };

type EmailExpectation = {
    template: string;
    to: string;
    /**
     * Optional: assert a specific notification_logs status. By default the
     * matcher only verifies the row was DISPATCHED (i.e., created by the
     * email handler), regardless of whether the queue worker has yet moved
     * it QUEUED → SENT. Pass "SENT" here for a stricter "actually sent to
     * Resend" check, but be aware the queue runs async and may not have
     * processed yet at assertion time.
     */
    status?: string;
};

/**
 * Asserts that `notification_logs` contains a row for the given entity's
 * system_events emission matching the expected template + recipient.
 *
 * A row existing means the email handler ran and queued the send. Whether
 * Resend has ACKed delivery is orthogonal — use `waitForResendDelivered` on
 * the row's message_id for provider-side confirmation, or pass status="SENT"
 * here to assert the queue worker has already processed it.
 */
export const toHaveDispatchedEmail = async (
    entityId: string,
    expected: EmailExpectation
): Promise<MatcherResult> => {
    const rows = await db
        .select({
            template_key: notificationLogs.template_key,
            recipient_email: notificationLogs.recipient_email,
            status: notificationLogs.status,
            message_id: notificationLogs.message_id,
        })
        .from(notificationLogs)
        .innerJoin(systemEvents, eq(notificationLogs.event_id, systemEvents.id))
        .where(
            and(
                eq(systemEvents.entity_id, entityId),
                eq(notificationLogs.template_key, expected.template),
                eq(notificationLogs.recipient_email, expected.to)
            )
        );

    if (rows.length === 0) {
        return {
            pass: false,
            message: () =>
                `expected a notification_logs row for entity ${entityId} with template="${expected.template}" to="${expected.to}", but none was found`,
        };
    }

    if (expected.status && rows[0].status !== expected.status) {
        return {
            pass: false,
            message: () =>
                `notification_logs row for entity ${entityId} template="${expected.template}" to="${expected.to}" has status="${rows[0].status}", expected "${expected.status}"`,
        };
    }

    return {
        pass: true,
        message: () =>
            `expected NO notification_logs row for entity ${entityId} with template="${expected.template}" to="${expected.to}", but one exists (status=${rows[0].status}, message_id=${rows[0].message_id ?? "<none yet>"})`,
    };
};

/**
 * Returns all notification_logs rows tied to the given entity, newest-first
 * by created_at. Useful for diagnostics: dump this list if an assertion
 * fails unexpectedly.
 */
export const getDispatchedEmailsForEntity = async (entityId: string) => {
    return db
        .select({
            template_key: notificationLogs.template_key,
            recipient_email: notificationLogs.recipient_email,
            status: notificationLogs.status,
            message_id: notificationLogs.message_id,
            created_at: notificationLogs.created_at,
        })
        .from(notificationLogs)
        .innerJoin(systemEvents, eq(notificationLogs.event_id, systemEvents.id))
        .where(eq(systemEvents.entity_id, entityId));
};
