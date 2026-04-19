/**
 * Resend helper — poll a message's delivered status.
 *
 * `notification_logs.message_id` captures the Resend ID at send time. After
 * queue-worker processing + network transit, Resend's `last_event` field
 * on GET /emails/:id transitions from `sent` → `delivered` (or `bounced` /
 * `failed` on the error paths). This helper polls until `delivered`.
 *
 * See docs/e2e-testing-system.md §7 decision 12: `delivered` is the machine-
 * side proof; the real Outlook inbox is the human spot-check.
 */

import { pollUntil } from "./poll";

const RESEND_BASE = "https://api.resend.com";

type ResendEmailResponse = {
    id: string;
    to: string[] | string;
    from: string;
    subject: string;
    last_event?: string;
    created_at?: string;
};

const getResendApiKey = (): string => {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set at the time of the Resend API call.");
    return key;
};

export const getResendEmail = async (messageId: string): Promise<ResendEmailResponse | null> => {
    const res = await fetch(`${RESEND_BASE}/emails/${messageId}`, {
        headers: { authorization: `Bearer ${getResendApiKey()}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`Resend GET /emails/${messageId} returned ${res.status}`);
    }
    return (await res.json()) as ResendEmailResponse;
};

export type WaitForDeliveredOpts = {
    timeoutMs?: number;
    intervalMs?: number;
};

/**
 * Polls Resend until `last_event === "delivered"`. Throws on timeout or on
 * explicit failure events (`bounced`, `failed`, `complained`).
 */
export const waitForResendDelivered = async (
    messageId: string,
    opts: WaitForDeliveredOpts = {}
): Promise<ResendEmailResponse> => {
    return pollUntil(
        async () => {
            const email = await getResendEmail(messageId);
            if (!email) return null;
            const event = email.last_event;
            if (event === "delivered") return email;
            if (event === "bounced" || event === "failed" || event === "complained") {
                throw new Error(`Resend reports ${event} for ${messageId} (to=${email.to})`);
            }
            return null;
        },
        {
            timeoutMs: opts.timeoutMs ?? 30_000,
            intervalMs: opts.intervalMs ?? 1_000,
            message: `Resend did not reach 'delivered' for message ${messageId}`,
        }
    );
};
