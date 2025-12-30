import nodemailer from 'nodemailer';
import config from '../config';

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    from?: string;
}

// Create reusable transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.smtp_port === 465, // true for 465, false for other ports
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass,
        },
    });
};


export const sendEmail = async (options: EmailOptions): Promise<string> => {
    try {
        const { to, subject, html, from = config.email_from } = options;

        const transporter = createTransporter();

        // Send email
        const info = await transporter.sendMail({
            from: from || `"${config.app_name}" <${config.email_from}>`,
            to,
            subject,
            html,
        });

        console.log('✅ Email sent successfully:', {
            messageId: info.messageId,
            to,
            subject,
        });

        return info.messageId
    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error;
    }
};
