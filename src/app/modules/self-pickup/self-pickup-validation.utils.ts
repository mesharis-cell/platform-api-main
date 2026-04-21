/**
 * Self-Pickup Validation Utilities
 * Business rule validation for the self-pickup lifecycle.
 */

const CANCELLABLE_STATUSES = [
    "SUBMITTED",
    "PRICING_REVIEW",
    "PENDING_APPROVAL",
    "QUOTED",
    "CONFIRMED",
    "READY_FOR_PICKUP",
];

export function canCancelSelfPickup(status: string): boolean {
    return CANCELLABLE_STATUSES.includes(status);
}

export function canAddLineItems(status: string): boolean {
    return ["PRICING_REVIEW", "PENDING_APPROVAL"].includes(status);
}

export function canSubmitForApproval(status: string): boolean {
    return status === "PRICING_REVIEW";
}

export function canApproveQuote(status: string): boolean {
    return status === "PENDING_APPROVAL";
}

export function canMarkReadyForPickup(status: string): boolean {
    return status === "CONFIRMED";
}

export function canTriggerReturn(status: string): boolean {
    // IN_USE removed from enum in migration 0044 — only PICKED_UP is a valid
    // entry point for triggering return.
    return status === "PICKED_UP";
}

export function canReturnToLogistics(status: string): boolean {
    return status === "PENDING_APPROVAL";
}
