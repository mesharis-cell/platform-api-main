type AdjustPriceTemplatePayload = { order_id: string, company_name: string, adjusted_price: number, adjustment_reason: string, view_order_url: string };

export const emailTemplates = {
    adjust_price: (data: AdjustPriceTemplatePayload) => (
        `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f6f9fc;">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px;">
                                    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 0 0 24px; border-radius: 4px;">
                                        <p style="margin: 0; font-size: 14px; font-weight: 600; color: #92400e;">ACTION REQUIRED</p>
                                    </div>
                                    <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">A2 Pricing Adjustment Requires Review</h1>
                                    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">A2 Logistics has adjusted the pricing for order <strong>${data.order_id}</strong> and requires your approval before the quote can be sent to the client.</p>
                                    <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Order ID:</strong> ${data.order_id}</p>
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Company:</strong> ${data.company_name}</p>
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Adjusted Price:</strong> ${data.adjusted_price} AED</p>
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Reason:</strong> ${data.adjustment_reason}</p>
                                    </div>
                                    <a href="${data.view_order_url}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Review and Approve</a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `
    )
}