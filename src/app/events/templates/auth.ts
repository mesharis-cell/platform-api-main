import { EmailTemplate } from "./index";
import { footer, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

// ─── password_reset_otp ───────────────────────────────────────────────────────
export const passwordResetOtp: EmailTemplate = {
    subject: () => `Password Reset Request`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0; font-size: 28px; font-weight: bold; color: #1f2937; line-height: 1.3;">Password Reset Request</h1>
            <p style="margin: 16px 0 0; font-size: 16px; line-height: 1.6; color: #374151;">We received a request to reset the password for <strong>${d.email}</strong>.</p>
            <p style="margin: 12px 0 0; font-size: 16px; line-height: 1.6; color: #374151;">Use the following One-Time Password (OTP) to reset your password:</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; margin: 24px 0;">
                <tr>
                    <td style="padding: 32px; text-align: center;">
                        <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #fff; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
                        <p style="margin: 0; font-size: 48px; font-weight: bold; color: #fff; letter-spacing: 8px; font-family: 'Courier New', monospace;">${d.otp}</p>
                    </td>
                </tr>
            </table>

            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin: 16px 0;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #92400e;">⏱️ This OTP will expire in 5 minutes</p>
            </div>

            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 16px 0;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #991b1b;">🔒 Security Notice</p>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #7f1d1d;">If you didn't request a password reset, please ignore this email or contact support.</p>
            </div>

            ${footer()}
        `);
    },
};
