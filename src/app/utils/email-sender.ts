import { sendEmail } from "../services/email.service";

export const multipleEmailSender = async (to: string[], subject: string, html: string) => {
    const emailPromises = to.map(async (email) => {
        return sendEmail({
            to: email,
            subject,
            html,
        });
    })

    // Send all emails concurrently
    await Promise.all(emailPromises)
}