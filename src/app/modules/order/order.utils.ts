import dayjs from "dayjs";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../db";
import { assetBookings, assets, financialStatusEnum, orderItems, orders, orderStatusEnum, scanEvents } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";
import { AuthUser } from "../../interface/common";
import CustomizedError from "../../error/customized-error";
import httpStatus from "http-status";
import { AssetStatus } from "../asset/assets.interfaces";

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
			'DELIVERED->IN_USE',
			'IN_USE->AWAITING_RETURN',
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

export type UnavailableItem = {
	asset_id: string;
	asset_name: string;
	requested: number;
	available: number;
	next_available_date?: Date;
}

export type AvailableItem = {
	id: string;
	status: AssetStatus;
	refurb_days_estimate: number | null;
}

// ----------------------------------- CHECK ASSETS FOR ORDER -----------------------------------
export const checkAssetsForOrder = async (platformId: string, companyId: string, requiredAssets: { id: string, quantity: number }[], eventStartDate: Date, eventEndDate: Date) => {
	const assetIds = requiredAssets.map((asset) => asset.id);

	// Step 1: Verify assets exist and belong to the company
	const foundAssets = await db
		.select()
		.from(assets)
		.where(
			and(
				inArray(assets.id, assetIds),
				eq(assets.company_id, companyId),
				eq(assets.platform_id, platformId),
				isNull(assets.deleted_at)
			)
		);

	if (foundAssets.length !== assetIds.length) {
		throw new CustomizedError(
			httpStatus.NOT_FOUND,
			"One or more assets not found or do not belong to your company"
		);
	}

	// Step 2: Verify all assets have AVAILABLE status
	const unavailableAssets = foundAssets.filter((a) => a.status !== "AVAILABLE");
	if (unavailableAssets.length > 0) {
		throw new CustomizedError(
			httpStatus.BAD_REQUEST,
			`Cannot order unavailable assets: ${unavailableAssets.map((a) => a.name).join(", ")}`
		);
	}

	const unavailableItems: Array<UnavailableItem> = [];
	const availableItems = [];

	// Step 3: Check date-based availability for requested quantities
	for (const item of requiredAssets) {
		// Find asset in the foundAssets array
		const asset = foundAssets.find((a) => a.id === item.id);
		if (!asset) {
			throw new CustomizedError(
				httpStatus.NOT_FOUND,
				`Asset "${item.id}" not found`
			);
		}

		// Query overlapping bookings for the event period
		const overlappingBookings = await db.query.assetBookings.findMany({
			where: and(
				eq(assetBookings.asset_id, item.id),
				sql`${assetBookings.blocked_from} <= ${eventStartDate}`,
				sql`${assetBookings.blocked_until} >= ${eventEndDate}`
			),
			with: {
				order: {
					columns: {
						id: true,
						order_id: true,
					},
				},
			},
		});

		// Calculate available quantity
		const bookedQuantity = overlappingBookings.reduce((sum, booking) => sum + booking.quantity, 0);
		// const availableQuantity = Math.max(0, item.quantity - bookedQuantity);
		const availableQuantity = Math.max(0, (asset.total_quantity - bookedQuantity));

		// If insufficient quantity, track for error message
		if (availableQuantity < item.quantity) {
			// Find next available date from latest booking end
			let nextAvailableDate: Date | undefined;
			if (overlappingBookings.length > 0) {
				const latestBookingEnd = new Date(
					Math.max(...overlappingBookings.map(b => new Date(b.blocked_until).getTime()))
				);
				nextAvailableDate = new Date(latestBookingEnd);
				nextAvailableDate.setDate(nextAvailableDate.getDate() + 1);
			}

			unavailableItems.push({
				asset_id: item.id,
				asset_name: asset.name,
				requested: item.quantity,
				available: availableQuantity,
				next_available_date: nextAvailableDate,
			});
		} else {
			const remainingQuantity = Math.max(0, (availableQuantity - item.quantity));

			const assetStatus: AssetStatus = asset.tracking_method === "INDIVIDUAL" ? "BOOKED" : remainingQuantity <= 0 ? "BOOKED" : "AVAILABLE";

			availableItems.push({
				...asset,
				status: assetStatus,
				available_quantity: remainingQuantity,
			});
		}
	}

	// Step 4: Throw error if any items are unavailable
	if (unavailableItems.length > 0) {
		const unavailableList = unavailableItems
			.map(({ asset_name, requested, available, next_available_date }) => {
				const nextDate = next_available_date
					? ` (available from ${new Date(next_available_date).toLocaleDateString()})`
					: "";

				return `${asset_name}: requested ${requested}, available ${available} ${nextDate}`;
			})
			.join("; ");

		throw new CustomizedError(
			httpStatus.BAD_REQUEST,
			`Insufficient availability for requested dates: ${unavailableList}`
		);
	}

	return availableItems;
}