import { Resend } from "resend";
import config from "../config";
import { getAppEnv, type AppEnv } from "../constants/app-env";

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

const ENV_LABEL_BY_ENV: Record<AppEnv, string> = {
    production: "",
    staging: "STAGING",
    testing: "TESTING",
};

// Recognized in non-production envs only. E2E-test aliases follow this pattern
// and forward to a single operator inbox, so the operator needs a fast visual
// signal of which role an email was addressed to. For non-matching recipients
// this returns null and only the env label is used.
const extractE2ERole = (to: string): string | null => {
    const match = to.match(/^e2e\.kadence\.([a-z]+)@/i);
    return match ? match[1].toUpperCase() : null;
};

const buildSubjectPrefix = (env: AppEnv, to: string): string => {
    const envLabel = ENV_LABEL_BY_ENV[env];
    if (!envLabel) return "";
    const role = extractE2ERole(to);
    const inner = role ? `${envLabel} → ${role}` : envLabel;
    return `[${inner}]: `;
};

export const sendEmail = async (options: EmailOptions): Promise<string> => {
    const apiKey = config.resend_api_key;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const resend = new Resend(apiKey);
    const { to, subject, html, text, from, replyTo, headers, attachments } = options;
    const fromAddress = from || "no-reply@unconfigured.kadence.app";
    const finalSubject = `${buildSubjectPrefix(getAppEnv(), to)}${subject}`;

    const payload = {
        from: fromAddress,
        to,
        subject: finalSubject,
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

    console.log("✅ Email sent:", { messageId: data!.id, to, subject: finalSubject });
    return data!.id;
};
