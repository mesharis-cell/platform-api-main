import dayjs from "dayjs";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { financialStatusEnum, orderItems, orders, orderStatusEnum, scanEvents } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";
import { AuthUser } from "../../interface/common";

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