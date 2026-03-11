export const baseStyle = `margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc; color: #111827;`;

export const formatAmount = (value?: number | string | null) =>
    value === undefined || value === null ? "—" : Number(value).toFixed(2);

export function wrap(content: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="${baseStyle}">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">Kadence platform notification</div>
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 12px; border: 1px solid #e5e7eb;">
      <tr><td style="padding: 24px 40px 0; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280; font-weight: 700;">
        Kadence Platform
      </td></tr>
      <tr><td style="padding: 18px 40px 40px;">
        ${content}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function footer(supportEmail = "support@platform.com"): string {
    return `<p style="margin: 24px 0 0; font-size: 13px; color: #6b7280;">Questions? Contact us at <a href="mailto:${supportEmail}" style="color: #2563eb;">${supportEmail}</a></p>
<p style="margin: 8px 0 0; font-size: 11px; color: #9ca3af;">This is an automated platform notification. Replies may not be monitored.</p>`;
}

export function actionButton(label: string, url: string, color = "#2563eb"): string {
    return `<a href="${url}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: ${color}; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">${label}</a>`;
}

export function infoBox(content: string, bgColor = "#f9fafb", borderColor?: string): string {
    const border = borderColor ? `border-left: 4px solid ${borderColor};` : "";
    return `<div style="background: ${bgColor}; ${border} border-radius: 8px; padding: 24px; margin: 24px 0;">${content}</div>`;
}

export function infoRow(label: string, value: string): string {
    return `<p style="margin: 8px 0;"><strong>${label}:</strong> ${value}</p>`;
}
