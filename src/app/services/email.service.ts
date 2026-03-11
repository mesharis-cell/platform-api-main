import { Resend } from "resend";
import config from "../config";

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    headers?: Record<string, string>;
    attachments?: Array<{ filename: string; content: Buffer | string }>;
}

export const sendEmail = async (options: EmailOptions): Promise<string> => {
    const apiKey = config.resend_api_key;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(apiKey);
    const { to, subject, html, text, from, replyTo, headers, attachments } = options;
    const fromAddress = from || "no-reply@unconfigured.kadence.app";

    const payload = {
        from: fromAddress,
        to,
        subject,
        html,
        text,
        replyTo,
        headers,
        attachments: attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
        })),
    } as unknown as Parameters<typeof resend.emails.send>[0];

    const { data, error } = await resend.emails.send(payload);

    if (error) {
        console.error("❌ Resend error:", error);
        const wrappedError = new Error(error.message) as Error & {
            statusCode?: number;
            code?: string;
            name?: string;
        };
        wrappedError.statusCode = (error as any)?.statusCode ?? (error as any)?.status;
        wrappedError.code = (error as any)?.code;
        wrappedError.name = (error as any)?.name || "ResendError";
        throw wrappedError;
    }

    console.log("✅ Email sent:", { messageId: data!.id, to, subject });
    return data!.id;
};
