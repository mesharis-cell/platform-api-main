type AdjustPriceTemplatePayload = {
    order_id: string,
    company_name: string,
    adjusted_price: number,
    adjustment_reason: string,
    view_order_url: string
};

type SubmitOrderTemplatePayload = {
    order_id: string,
    company_name: string,
    event_start_date: string,
    event_end_date: string,
    venue_city: string,
    total_volume: string,
    item_count: number,
    view_order_url: string,
    by_role: {
        greeting: string,
        message: string,
        action: string
    }
};

type SendInvoiceToClientTemplatePayload = {
    invoice_number: string,
    order_id: string,
    company_name: string,
    final_total_price: string,
    download_invoice_url: string
};

type SendInvoiceToAdminTemplatePayload = {
    invoice_number: string,
    order_id: string,
    company_name: string,
    final_total_price: string,
    download_invoice_url: string
};

type AdjustmentNotificationTemplatePayload = {
    order_id: string,
    company_name: string,
    adjusted_price: number,
    adjustment_reason: string,
    view_order_url: string
};

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
    ),
    submit_order: (data: SubmitOrderTemplatePayload) => (
        `
        <!DOCTYPE html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Submitted: ${data.order_id}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; background-color: #f6f9fc;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f6f9fc;">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 40px 40px 0;">
                                    <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: #1f2937; line-height: 1.3;">Order Submitted</h1>
                                </td>
                            </tr>

                            <!-- Greeting -->
                            <tr>
                                <td style="padding: 16px 40px 0;">
                                    <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #374151;">Hello ${data.by_role.greeting},</p>
                                </td>
                            </tr>

                            <!-- Message -->
                            <tr>
                                <td style="padding: 16px 40px 0;">
                                    <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #374151;">${data.by_role.message}</p>
                                </td>
                            </tr>

                            <!-- Order Details Box -->
                            <tr>
                                <td style="padding: 24px 40px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f9fafb; border-radius: 8px;">
                                        <tr>
                                            <td style="padding: 24px;">
                                                <p style="margin: 0 0 16px; font-size: 18px; font-weight: bold; color: #111827;">Order Details</p>
                                                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 0 0 16px;">

                                                <p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
                                                    <strong>Order ID:</strong> ${data.order_id}
                                                </p>
                                                <p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
                                                    <strong>Company:</strong> ${data.company_name}
                                                </p>
                                                <p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
                                                    <strong>Event Dates:</strong> ${data.event_start_date} to ${data.event_end_date}
                                                </p>
                                                <p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
                                                    <strong>Venue City:</strong> ${data.venue_city}
                                                </p>
                                                <p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
                                                    <strong>Total Volume:</strong> ${data.total_volume} m³
                                                </p>
                                                <p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
                                                    <strong>Item Count:</strong> ${data.item_count} items
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Action Section -->
                            <tr>
                                <td style="padding: 0 40px 32px;">
                                    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">${data.by_role.action}</p>
                                    <a href="${data.view_order_url}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; padding: 12px 32px; border-radius: 6px;">View Order</a>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="padding: 32px 40px;">
                                    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 0 0 32px;">
                                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #6b7280;">
                                        This is an automated message from the Asset Fulfillment System. Please do not reply to this email.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
	    `
    ),
    send_invoice_to_client: (data: SendInvoiceToClientTemplatePayload) => (
        `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice: ${data.invoice_number}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f9fc;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f6f9fc;">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
                            <tr>
                                <td style="padding: 40px;">
                                    <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Ready</h1>
                                    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">Your invoice for order <strong>${data.order_id}</strong> is ready.</p>
                                    <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Invoice Number:</strong> ${data.invoice_number}</p>
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Order ID:</strong> ${data.order_id}</p>
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Company:</strong> ${data.company_name}</p>
                                        <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total Amount: ${data.final_total_price} AED</p>
                                    </div>
                                    <p style="margin: 16px 0; font-size: 16px; line-height: 1.6; color: #374151;">Please find your invoice attached to this email. You can also download it from your dashboard.</p>
                                    <div style="background-color: #eff6ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
                                        <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #1e40af;">Payment Instructions</p>
                                        <p style="margin: 4px 0; font-size: 13px; color: #374151;">Payment Method: Bank Transfer or Check</p>
                                        <p style="margin: 4px 0; font-size: 13px; color: #374151;">Payment Terms: Net 30 Days</p>
                                        <p style="margin: 4px 0; font-size: 13px; color: #374151;">Payment Reference: ${data.invoice_number}</p>
                                    </div>
                                    <a href="${data.download_invoice_url}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Download Cost Estimate</a>
                                    <p style="margin: 24px 0 0; font-size: 13px; color: #6b7280;">Thank you for your business. For questions about this invoice, please contact your account manager.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
		`
    ),
    send_invoice_to_admin: (data: SendInvoiceToAdminTemplatePayload) => (
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
                                    <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Sent to Client</h1>
                                    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">An invoice has been sent to the client for order <strong>${data.order_id}</strong>.</p>
                                    <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Invoice Number:</strong> ${data.invoice_number}</p>
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Order ID:</strong> ${data.order_id}</p>
                                        <p style="margin: 8px 0; font-size: 14px; color: #374151;"><strong>Company:</strong> ${data.company_name}</p>
                                        <p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total Amount: ${data.final_total_price} AED</p>
                                    </div>
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
};