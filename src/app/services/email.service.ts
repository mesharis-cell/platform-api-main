import { Resend } from "resend";
import config from "../config";

const resend = new Resend(config.resend_api_key);

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    from?: string;
    attachments?: Array<{ filename: string; content: Buffer | string }>;
}

export const sendEmail = async (options: EmailOptions): Promise<string> => {
    const { to, subject, html, from, attachments } = options;
    const fromAddress = from || config.email_from || "no-reply@unconfigured.kadence.app";

    const { data, error } = await resend.emails.send({
        from: fromAddress,
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
        })),
    });

    if (error) {
        console.error("❌ Resend error:", error);
        throw new Error(error.message);
    }

    console.log("✅ Email sent:", { messageId: data!.id, to, subject });
    return data!.id;
};
