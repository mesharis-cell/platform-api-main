import {
    NotificationData,
    NotificationType,
} from "../modules/notification-logs/notification-logs.interfaces";

export async function getEmailTemplate(
    notificationType: NotificationType,
    data: NotificationData
): Promise<{ subject: string; html: string }> {
    const baseStyle = `
		margin: 0; padding: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background-color: #f6f9fc;
	`;
    const formatAmount = (value?: number | string | null) =>
        value === undefined || value === null ? "—" : Number(value).toFixed(2);
    const lineItemsHtml =
        data.line_items && data.line_items.length > 0
            ? data.line_items
                  .filter(
                      (item) =>
                          item.billing_mode === "BILLABLE" || item.billing_mode === "COMPLIMENTARY"
                  )
                  .map(
                      (item) => {
                          const amount = item.amount ?? item.total;
                          if (item.billing_mode === "COMPLIMENTARY") {
                              return `<p style="margin: 6px 0;"><strong>${item.description}:</strong> Complimentary (valued at ${formatAmount(amount)} AED)</p>`;
                          }
                          return `<p style="margin: 6px 0;"><strong>${item.description}:</strong> ${formatAmount(amount)} AED</p>`;
                      }
                  )
                  .join("")
            : `<p style="margin: 6px 0; color: #6b7280;">No additional service items</p>`;
    const pricingBreakdownHtml = data.pricing
        ? `
            <p style="margin: 6px 0;"><strong>Logistics & Handling:</strong> ${formatAmount(
                data.pricing.base_ops_total
            )} AED</p>
            ${lineItemsHtml}
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 12px 0;">
            <p style="margin: 6px 0;"><strong>Subtotal:</strong> ${formatAmount(
                data.pricing.logistics_sub_total
            )} AED</p>
            <p style="margin: 6px 0;"><strong>Service Fee:</strong> ${formatAmount(
                data.pricing.margin?.amount
            )} AED</p>
        `
        : "";

    const templates: Record<NotificationType, { subject: string; html: string }> = {
        ORDER_SUBMITTED: {
            subject: `Order Submitted: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Order Submitted Successfully</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your order has been received and is now being reviewed.</p>
				<div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
					<p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventStartDate} - ${data.eventEndDate}</p>
					<p style="margin: 8px 0;"><strong>Venue:</strong> ${data.venueName}, ${data.venueCity}</p>
				</div>
				<p style="margin: 16px 0;">Next Steps: Our team will review your order and contact you with pricing within 24 hours.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order</a>
				<p style="margin: 24px 0 0; font-size: 14px; color: #6b7280;">Questions? Contact us at ${data.supportEmail} or ${data.supportPhone}</p>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        QUOTE_SENT: {
            subject: `Quote Ready: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Your Quote is Ready</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your quote for order ${data.orderIdReadable} is ready for review.</p>
				<div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
                    ${pricingBreakdownHtml}
					<p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total: ${formatAmount(
                        data.pricing?.final_total || data.finalTotalPrice
                    )} AED</p>
				</div>
				<p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review and approve or decline the quote.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Quote</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        QUOTE_REVISED: {
            subject: `Revised Quote: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Your Quote Has Been Revised</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your quote for order ${data.orderIdReadable} has been updated.</p>
				<div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Previous Total:</strong> ${formatAmount(
                        data.previous_total
                    )} AED</p>
					<p style="margin: 8px 0;"><strong>New Total:</strong> ${formatAmount(data.new_total)} AED</p>
					${data.revision_reason ? `<p style="margin: 8px 0;"><strong>Reason:</strong> ${data.revision_reason}</p>` : ""}
				</div>
				<p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review and acknowledge the revised quote to proceed.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Revised Quote</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        INVOICE_GENERATED: {
            subject: `Invoice Ready: ${data.invoiceNumber}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Invoice Ready for Payment</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your invoice is ready for payment.</p>
				<div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Amount Due: ${data.finalTotalPrice} AED</p>
				</div>
				<p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Payment Required: Please process payment to proceed with fulfillment.</p>
				<a href="${data.serverUrl}/client/v1/invoice/download-pdf/${data.invoiceNumber}?pid=${data.platformId}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Download Cost Estimate PDF</a>
				<p style="margin: 16px 0; font-size: 14px; color: #6b7280;">Or view order details: <a href="${data.orderUrl}" style="color: #2563eb; text-decoration: underline;">View Order</a></p>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        ORDER_CANCELLED: {
            subject: `Order Cancelled: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Order Cancelled</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order ${data.orderIdReadable} has been cancelled.</p>
				<div style="background: #fef2f2; border-radius: 8px; padding: 24px; margin: 24px 0;">
					${data.cancellation_reason ? `<p style="margin: 8px 0;"><strong>Reason:</strong> ${data.cancellation_reason}</p>` : ""}
					${data.cancellation_notes ? `<p style="margin: 8px 0;"><strong>Notes:</strong> ${data.cancellation_notes}</p>` : ""}
				</div>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        FABRICATION_COMPLETE: {
            subject: `Fabrication Complete: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">Fabrication Complete</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Fabrication for order ${data.orderIdReadable} is complete and ready for preparation.</p>
				<div style="background: #f0fdf4; border-radius: 8px; padding: 24px; margin: 24px 0;">
					${
                        data.fabrication_items?.length
                            ? data.fabrication_items
                                  .map(
                                      (item) =>
                                          `<p style="margin: 8px 0;"><strong>${item.original_asset_name}</strong> → ${item.new_asset_name} (QR: ${item.new_qr_code})</p>`
                                  )
                                  .join("")
                            : `<p style="margin: 8px 0;">All rebranding items complete.</p>`
                    }
				</div>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        DELIVERED: {
            subject: `Order Delivered: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Order Delivered Successfully</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your order has been delivered to the venue.</p>
				<div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Venue:</strong> ${data.venueName}</p>
					${data.pickupWindow ? `<p style="margin: 8px 0;"><strong>Pickup Window:</strong> ${data.pickupWindow}</p>` : ""}
				</div>
				<p style="margin: 16px 0;">Please remember to prepare items for return during the scheduled pickup window.</p>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        PICKUP_REMINDER: {
            subject: `Pickup Reminder: ${data.orderIdReadable} in 48 Hours`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #f59e0b;">⏰ Pickup Reminder</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your order is scheduled for pickup in 48 hours.</p>
				<div style="background: #fef3c7; border-radius: 8px; padding: 24px; margin: 24px 0; border-left: 4px solid #f59e0b;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Pickup Window:</strong> ${data.pickupWindow}</p>
					<p style="margin: 8px 0;"><strong>Venue:</strong> ${data.venueName}</p>
				</div>
				<p style="margin: 16px 0; font-weight: 600;">Please ensure all items are ready for pickup at the scheduled time.</p>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },

        // Enhanced templates for all remaining types
        A2_ADJUSTED_PRICING: {
            subject: `Action Required: Pricing Adjustment for ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #f59e0b;">⚠️ Pricing Adjustment Required</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A2 Logistics has adjusted pricing for this order and requires PMG approval before sending quote to client.</p>
                <!-- TODO: A2 Information -->
				<p style="margin: 16px 0; color: #dc2626; font-weight: 600;">⚠️ Action Required: Please review and approve pricing before it's sent to the client.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #f59e0b; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Review Pricing</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        QUOTE_APPROVED: {
            subject: `Quote Approved: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Quote Approved</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Great news! The client has approved the quote and the order is proceeding to invoicing.</p>
				<div style="background: #f0fdf4; border-left: 4px solid #10b981; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
					<p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Total Amount: ${data.finalTotalPrice} AED</p>
				</div>
				<p style="margin: 16px 0;">Next Steps: Invoice is being generated and will be sent to the client shortly.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        QUOTE_DECLINED: {
            subject: `Quote Declined: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Quote Declined</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The client has declined the quote for this order.</p>
				<div style="background: #fef2f2; border-left: 4px solid #dc2626; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
					<!-- TODO: Add decline reason -->
				</div>
				<p style="margin: 16px 0;">You may want to follow up with the client to understand their concerns and potentially provide a revised quote.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #dc2626; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order Details</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        PAYMENT_CONFIRMED: {
            subject: `Payment Confirmed: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #10b981;">✓ Payment Confirmed</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Payment has been received and confirmed for this order.</p>
				<div style="background: #f0fdf4; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
					<p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">Amount Paid: ${data.finalTotalPrice} AED</p>
				</div>
				<p style="margin: 16px 0;">Next Steps: Set delivery schedule and confirm order to begin fulfillment.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Proceed with Order</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        ORDER_CONFIRMED: {
            subject: `Order Confirmed: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Order Confirmed & Proceeding to Fulfillment</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Order has been confirmed and assets have been reserved. Fulfillment process is beginning.</p>
				<div style="background: #eff6ff; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
					<p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventStartDate}</p>
					<p style="margin: 8px 0;"><strong>Venue:</strong> ${data.venueName}, ${data.venueCity}</p>
				</div>
				<p style="margin: 16px 0;">Warehouse team will begin preparing items for delivery.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        READY_FOR_DELIVERY: {
            subject: `Ready for Delivery: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #8b5cf6;">All Items Scanned & Ready for Delivery</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">All items have been scanned out and loaded. Order is ready to be dispatched.</p>
				<div style="background: #f5f3ff; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Venue:</strong> ${data.venueName}</p>
					${data.deliveryWindow ? `<p style="margin: 8px 0;"><strong>Delivery Window:</strong> ${data.deliveryWindow}</p>` : ""}
				</div>
				<p style="margin: 16px 0;">Coordinate with delivery team for dispatch.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #8b5cf6; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        IN_TRANSIT: {
            subject: `Order In Transit: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #0ea5e9;">🚚 Your Order is On The Way</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Your items are currently in transit to the venue.</p>
				<div style="background: #f0f9ff; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Venue:</strong> ${data.venueName}, ${data.venueCity}</p>
					${data.deliveryWindow ? `<p style="margin: 8px 0;"><strong>Estimated Delivery:</strong> ${data.deliveryWindow}</p>` : ""}
				</div>
				<p style="margin: 16px 0;">Please ensure someone is available to receive the delivery during the scheduled window.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #0ea5e9; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Track Order</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        ORDER_CLOSED: {
            subject: `Order Completed: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #059669;">✓ Order Complete</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">All items have been returned and the order has been completed successfully.</p>
				<div style="background: #f0fdf4; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					<p style="margin: 8px 0;"><strong>Company:</strong> ${data.companyName}</p>
					<p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventStartDate} - ${data.eventEndDate}</p>
				</div>
				<p style="margin: 16px 0;">Thank you for your business! All assets have been returned and are now available for future orders.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #059669; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Order Summary</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
        TIME_WINDOWS_UPDATED: {
            subject: `Delivery Schedule Updated: ${data.orderIdReadable}`,
            html: `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="${baseStyle}">
	<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding: 40px 20px;">
		<table width="600" cellpadding="0" cellspacing="0" style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
			<tr><td style="padding: 40px;">
				<h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #2563eb;">Delivery Schedule Updated</h1>
				<p style="margin: 0 0 16px; font-size: 16px; color: #374151;">The delivery and pickup windows for your order have been updated.</p>
				<div style="background: #eff6ff; border-radius: 8px; padding: 24px; margin: 24px 0;">
					<p style="margin: 8px 0;"><strong>Order ID:</strong> ${data.orderIdReadable}</p>
					${data.deliveryWindow ? `<p style="margin: 8px 0;"><strong>Delivery Window:</strong> ${data.deliveryWindow}</p>` : ""}
					${data.pickupWindow ? `<p style="margin: 8px 0;"><strong>Pickup Window:</strong> ${data.pickupWindow}</p>` : ""}
				</div>
				<p style="margin: 16px 0;">Please ensure availability during the scheduled time windows.</p>
				<a href="${data.orderUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">View Updated Schedule</a>
			</td></tr>
		</table>
	</td></tr></table>
</body></html>
			`,
        },
    };

    return templates[notificationType];
}

// <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 24px; margin: 24px 0;" >
//     <p style="margin: 8px 0;" > <strong>Order ID: </strong> ${data.orderIdReadable}</p >
//         <p style="margin: 8px 0;" > <strong>Company: </strong> ${data.companyName}</p >
//             ${ data.adjustmentReason ? `<p style="margin: 8px 0;"><strong>Adjustment Reason:</strong> ${data.adjustmentReason}</p>` : '' }
// 					${ data.a2AdjustedPrice ? `<p style="margin: 8px 0; font-size: 18px; font-weight: bold; color: #111827;">A2 Adjusted Price: ${data.a2AdjustedPrice} AED</p>` : '' }
// </div>

// ${ data.declineReason ? `<p style="margin: 16px 0 8px; font-weight: bold;">Reason:</p><p style="margin: 8px 0; padding: 12px; background: #fff; border-radius: 4px; border: 1px solid #fecaca;">${data.declineReason}</p>` : '' }
