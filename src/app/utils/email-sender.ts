import { sendEmail } from "../services/email.service";

export const multipleEmailSender = async (
    to: string[],
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: any }>
) => {
    const emailPromises = to.map(async (email) => {
        return sendEmail({
            to: email,
            subject,
            html,
            attachments,
        });
    });

    // Send all emails concurrently
    await Promise.all(emailPromises);
};
