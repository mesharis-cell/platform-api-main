import dayjs from "dayjs";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { financialStatusEnum, orderItems, orders, orderStatusEnum, scanEvents } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";
import { AuthUser } from "../../interface/common";
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
	order_status: orderStatusEnum.enumValues,
	financial_status: financialStatusEnum.enumValues,
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

// ----------------------------------- STATUS TRANSITIONS -------------------------------------
export const VALID_STATE_TRANSITIONS: Record<string, string[]> = {
	DRAFT: ['SUBMITTED'],
	SUBMITTED: ['PRICING_REVIEW'],
	PRICING_REVIEW: ['QUOTED', 'PENDING_APPROVAL'],
	PENDING_APPROVAL: ['QUOTED'],
	QUOTED: ['CONFIRMED', 'DECLINED'],
	DECLINED: [],
	CONFIRMED: ['IN_PREPARATION'],
	IN_PREPARATION: ['READY_FOR_DELIVERY'],
	READY_FOR_DELIVERY: ['IN_TRANSIT'],
	IN_TRANSIT: ['DELIVERED'],
	DELIVERED: ['IN_USE'],
	IN_USE: ['AWAITING_RETURN'],
	AWAITING_RETURN: ['CLOSED'],
	CLOSED: [],
};

export function isValidTransition(fromStatus: string, toStatus: string): boolean {
	const allowedTransitions = VALID_STATE_TRANSITIONS[fromStatus];
	if (!allowedTransitions) {
		return false;
	}
	return allowedTransitions.includes(toStatus);
}

// ----------------------------------- VALIDATE ROLE-BASED TRANSITION --------------------------
export function validateRoleBasedTransition(
	user: AuthUser,
	fromStatus: string,
	toStatus: string
): boolean {
	// ADMIN can force any valid transition
	if (user.role === 'ADMIN') {
		return true;
	}

	// CLIENT can only approve/decline quotes
	if (user.role === 'CLIENT') {
		if (
			fromStatus === 'QUOTED' &&
			(toStatus === 'CONFIRMED' || toStatus === 'DECLINED')
		) {
			return true;
		}
		return false;
	}

	// LOGISTICS can progress fulfillment stages
	if (user.role === 'LOGISTICS') {
		const allowedLogisticsTransitions = [
			'CONFIRMED->IN_PREPARATION',
			'IN_PREPARATION->READY_FOR_DELIVERY',
			'READY_FOR_DELIVERY->IN_TRANSIT',
			'IN_TRANSIT->DELIVERED',
			'AWAITING_RETURN->CLOSED',
		];

		const transitionKey = `${fromStatus}->${toStatus}`;
		return allowedLogisticsTransitions.includes(transitionKey);
	}

	return false;
}

/**
 * Calculate blocked period for an order including all buffers
 * Feedback #5: Adds 5-day prep + 3-day return buffers
 * Feedback #2: Adds refurb days if item needs refurbishment
 */

// Preparation buffer days (time needed before event to prepare assets)
export const PREP_BUFFER_DAYS = 5;

// Return buffer days (time needed after event for return and processing)
export const RETURN_BUFFER_DAYS = 3;

export function calculateBlockedPeriod(
	eventStartDate: Date,
	eventEndDate: Date,
	refurbDays: number = 0
): { blockedFrom: Date; blockedUntil: Date } {
	// Total prep time = prep buffer + refurb time
	const totalPrepDays = PREP_BUFFER_DAYS + refurbDays

	const blockedFrom = dayjs(eventStartDate).subtract(totalPrepDays, 'day').toDate()
	const blockedUntil = dayjs(eventEndDate).add(RETURN_BUFFER_DAYS, 'day').toDate()

	return { blockedFrom, blockedUntil }
}

// ----------------------------------- VALIDATE INBOUND SCANNING COMPLETE ----------------------
/**
 * Validates that all order items have been scanned in (inbound)
 * Returns true if all items scanned, false otherwise
 */
export async function validateInboundScanningComplete(
	orderId: string
): Promise<boolean> {
	// Get all order items
	const items = await db.query.orderItems.findMany({
		where: eq(orderItems.order_id, orderId),
	});

	if (items.length === 0) {
		return true; // No items to scan
	}

	// Get all inbound scan events for this order
	const inboundScans = await db.query.scanEvents.findMany({
		where: and(
			eq(scanEvents.order_id, orderId),
			eq(scanEvents.scan_type, 'INBOUND')
		),
	});

	// Check if each item has been fully scanned in
	for (const item of items) {
		const scannedQuantity = inboundScans
			.filter((scan) => scan.asset_id === item.asset_id)
			.reduce((sum, scan) => sum + scan.quantity, 0);

		if (scannedQuantity < item.quantity) {
			console.log(
				`❌ Item ${item.asset_name} not fully scanned: ${scannedQuantity}/${item.quantity}`
			);
			return false;
		}
	}

	console.log(`✅ All items scanned in for order ${orderId}`);
	return true;
}

// ----------------------------------- GET NOTIFICATION TYPE FOR TRANSITION --------------------
/**
 * Maps status transitions to notification types
 */
export function getNotificationTypeForTransition(
	fromStatus: string,
	toStatus: string
): string | null {
	// Map status transitions to notification types
	const transitionMap: Record<string, string> = {
		'DRAFT->SUBMITTED': 'ORDER_SUBMITTED',
		'SUBMITTED->PRICING_REVIEW': '', // No notification needed
		'PRICING_REVIEW->QUOTED': 'QUOTE_SENT', // A2 approved standard pricing, goes direct to client
		'PRICING_REVIEW->PENDING_APPROVAL': 'A2_ADJUSTED_PRICING', // A2 adjusted price, needs PMG review
		'PENDING_APPROVAL->QUOTED': 'QUOTE_SENT', // PMG approved, send to client
		'QUOTED->CONFIRMED': 'QUOTE_APPROVED', // Direct to CONFIRMED
		'QUOTED->DECLINED': 'QUOTE_DECLINED',
		'CONFIRMED->IN_PREPARATION': 'ORDER_CONFIRMED',
		'IN_PREPARATION->READY_FOR_DELIVERY': 'READY_FOR_DELIVERY',
		'READY_FOR_DELIVERY->IN_TRANSIT': 'IN_TRANSIT',
		'IN_TRANSIT->DELIVERED': 'DELIVERED',
		'DELIVERED->IN_USE': '', // No notification needed
		'IN_USE->AWAITING_RETURN': '', // No notification needed (PICKUP_REMINDER sent via cron 48h before)
		'AWAITING_RETURN->CLOSED': 'ORDER_CLOSED',
	};

	const key = `${fromStatus}->${toStatus}`;
	const notificationType = transitionMap[key];

	// Return null if empty string (no notification) or undefined (not in map)
	return notificationType && notificationType !== '' ? notificationType : null;
}