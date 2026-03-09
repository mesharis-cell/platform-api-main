declare module "resend" {
    export class Resend {
        constructor(apiKey: string);
        emails: {
            send(payload: {
                from: string;
                to: string;
                subject: string;
                html: string;
                attachments?: Array<{ filename: string; content: Buffer | string }>;
            }): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
    }
}
