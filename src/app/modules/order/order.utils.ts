import { desc, sql } from "drizzle-orm";
import { db } from "../../../db";
import { orders } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";
import { OrderSubmittedEmailData, RecipientRole } from "./order.interfaces";

// Sortable fields for order queries
export const orderSortableFields: Record<string, any> = {
    order_id: orders.order_id,
    order_status: orders.order_status,
    financial_status: orders.financial_status,
    event_start_date: orders.event_start_date,
    created_at: orders.created_at,
    updated_at: orders.updated_at,
};

// Query validation configuration
export const orderQueryValidationConfig = {
    sort_by: Object.keys(orderSortableFields),
    sort_order: sortOrderType,
};

// ------------------------------------- ORDER ID GENERATOR -------------------------------------
// FORMAT: ORD-YYYYMMDD-XXX
export const orderIdGenerator = async (): Promise<string> => {
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD

    // Find highest sequence number for today
    const prefix = `ORD-${dateStr}-`
    const todayOrders = await db
        .select({ order_id: orders.order_id })
        .from(orders)
        .where(sql`${orders.order_id} LIKE ${prefix + '%'}`)
        .orderBy(desc(orders.order_id))
        .limit(1)

    let sequence = 1
    if (todayOrders.length > 0) {
        const lastOrderId = todayOrders[0].order_id
        const lastSequence = parseInt(lastOrderId.split('-')[2], 10)
        sequence = lastSequence + 1
    }

    const sequenceStr = sequence.toString().padStart(3, '0')
    return `${prefix}${sequenceStr}`
}

// Order status constants
export const ORDER_STATUSES = [
    'DRAFT',
    'SUBMITTED',
    'PRICING_REVIEW',
    'PENDING_APPROVAL',
    'QUOTED',
    'DECLINED',
    'CONFIRMED',
    'IN_PREPARATION',
    'READY_FOR_DELIVERY',
    'IN_TRANSIT',
    'DELIVERED',
    'IN_USE',
    'AWAITING_RETURN',
    'CLOSED',
] as const;

// Financial status constants
export const FINANCIAL_STATUSES = [
    'PENDING_QUOTE',
    'QUOTE_SENT',
    'QUOTE_ACCEPTED',
    'PENDING_INVOICE',
    'INVOICED',
    'PAID',
] as const;

// Buffer days for asset availability (for delivery/pickup logistics)
export const AVAILABILITY_BUFFER_DAYS = 3;

// ----------------------------------- RENDER ORDER SUBMITTED EMAIL ---------------------------
export const renderOrderSubmittedEmail = (
    recipientRole: RecipientRole,
    data: OrderSubmittedEmailData
): string => {
    const roleMessages = {
        PLATFORM_ADMIN: {
            greeting: "Platform Admin",
            message: "A new order has been submitted and requires review.",
            action: "Review this order in the admin dashboard and monitor the pricing workflow.",
        },
        LOGISTICS_STAFF: {
            greeting: "Logistics Team",
            message: "A new order has been submitted and requires pricing review.",
            action: "Review the order details and provide pricing within 24-48 hours.",
        },
        CLIENT_USER: {
            greeting: "Client",
            message: "Your order has been successfully submitted.",
            action:
                "You will receive a quote via email within 24-48 hours. Track your order status in the dashboard.",
        },
    };

    const roleMessage = roleMessages[recipientRole];

    return `
<!DOCTYPE html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Order Submitted: ${data.orderId}</title>
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
							<p style="margin: 0; font-size: 16px; line-height: 1.6; color: #374151;">Hello ${roleMessage.greeting},</p>
						</td>
					</tr>

					<!-- Message -->
					<tr>
						<td style="padding: 16px 40px 0;">
							<p style="margin: 0; font-size: 16px; line-height: 1.6; color: #374151;">${roleMessage.message}</p>
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
											<strong>Order ID:</strong> ${data.orderId}
										</p>
										<p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
											<strong>Company:</strong> ${data.companyName}
										</p>
										<p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
											<strong>Event Dates:</strong> ${data.eventStartDate} to ${data.eventEndDate}
										</p>
										<p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
											<strong>Venue City:</strong> ${data.venueCity}
										</p>
										<p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
											<strong>Total Volume:</strong> ${data.totalVolume} m³
										</p>
										<p style="margin: 8px 0; font-size: 14px; line-height: 1.6; color: #374151;">
											<strong>Item Count:</strong> ${data.itemCount} items
										</p>
									</td>
								</tr>
							</table>
						</td>
					</tr>

					<!-- Action Section -->
					<tr>
						<td style="padding: 0 40px 32px;">
							<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #374151;">${roleMessage.action}</p>
							<a href="${data.viewOrderUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; padding: 12px 32px; border-radius: 6px;">View Order</a>
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
	`.trim();
};