/**
 * Pricing Formatting Utilities
 * Helper functions for formatting pricing data
 */

/**
 * Format AED currency
 */
export function formatAED(amount: number): string {
    return `${amount.toFixed(2)} AED`;
}

/**
 * Format percentage
 */
export function formatPercent(percent: number): string {
    return `${percent.toFixed(1)}%`;
}

/**
 * Format trip type for display
 */
export function formatTripType(tripType: string): string {
    return tripType === "ROUND_TRIP" ? "Round-trip" : "One-way";
}

/**
 * Format vehicle type for display
 */
export function formatVehicleType(vehicleType: string): string {
    const map: Record<string, string> = {
        STANDARD: "Standard Vehicle",
        "7_TON": "7-Ton Truck",
        "10_TON": "10-Ton Truck",
    };
    return map[vehicleType] || vehicleType;
}

/**
 * Format service category for display
 */
export function formatServiceCategory(category: string): string {
    return category
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

/**
 * Calculate total from quantity and rate
 */
export function calculateLineItemTotal(quantity: number, unitRate: number): number {
    return parseFloat((quantity * unitRate).toFixed(2));
}

/**
 * Round to 2 decimal places
 */
export function roundToTwo(num: number): number {
    return parseFloat(num.toFixed(2));
}
