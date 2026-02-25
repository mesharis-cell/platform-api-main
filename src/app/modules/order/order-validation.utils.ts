/**
 * Order Validation Utilities
 * Business rule validation for hybrid pricing workflow
 */

/**
 * Validate order can be cancelled
 */
export function canCancelOrder(orderStatus: string): boolean {
    const CANCELLABLE_STATUSES = [
        "DRAFT",
        "SUBMITTED",
        "PRICING_REVIEW",
        "PENDING_APPROVAL",
        "QUOTED",
        "CONFIRMED",
        "AWAITING_FABRICATION",
        "IN_PREPARATION",
    ];
    return CANCELLABLE_STATUSES.includes(orderStatus);
}

/**
 * Validate order can have line items added
 */
export function canAddLineItems(orderStatus: string): boolean {
    const EDITABLE_STATUSES = ["PRICING_REVIEW", "PENDING_APPROVAL"];
    return EDITABLE_STATUSES.includes(orderStatus);
}

/**
 * Validate vehicle type can be changed
 */
export function canChangeVehicle(orderStatus: string, userRole: string): boolean {
    const EDITABLE_STATUSES = ["PRICING_REVIEW", "PENDING_APPROVAL"];
    const ALLOWED_ROLES = ["ADMIN", "LOGISTICS"];
    return EDITABLE_STATUSES.includes(orderStatus) && ALLOWED_ROLES.includes(userRole);
}

/**
 * Get required fields for order submission
 */
export const REQUIRED_ORDER_FIELDS = [
    "items",
    "transport_trip_type",
    "event_start_date",
    "event_end_date",
    "venue_name",
    "venue_country",
    "venue_city",
    "venue_address",
    "contact_name",
    "contact_email",
    "contact_phone",
] as const;

/**
 * Validate trip type
 */
export function isValidTripType(tripType: string): boolean {
    return ["ONE_WAY", "ROUND_TRIP"].includes(tripType);
}

/**
 * Validate vehicle type
 */
export function isValidVehicleType(vehicleType: string): boolean {
    return ["STANDARD", "7_TON", "10_TON"].includes(vehicleType);
}
