/**
 * Order Validation Utilities
 * Business rule validation for hybrid pricing workflow
 */

import { orders } from '../../../db/schema'

/**
 * Validate order can be cancelled
 */
export function canCancelOrder(orderStatus: string): boolean {
  const CANCELLABLE_STATUSES = [
    'DRAFT',
    'SUBMITTED',
    'PRICING_REVIEW',
    'PENDING_APPROVAL',
    'QUOTED',
    'CONFIRMED',
    'AWAITING_FABRICATION',
    'IN_PREPARATION',
  ]
  return CANCELLABLE_STATUSES.includes(orderStatus)
}

/**
 * Validate order can have line items added
 */
export function canAddLineItems(orderStatus: string): boolean {
  const EDITABLE_STATUSES = ['PRICING_REVIEW', 'PENDING_APPROVAL']
  return EDITABLE_STATUSES.includes(orderStatus)
}

/**
 * Validate order can have reskins processed
 */
export function canProcessReskins(orderStatus: string): boolean {
  const PROCESSABLE_STATUSES = ['PENDING_APPROVAL']
  return PROCESSABLE_STATUSES.includes(orderStatus)
}

/**
 * Validate fabrication can be completed
 */
export function canCompleteFabrication(orderStatus: string): boolean {
  const COMPLETABLE_STATUSES = ['AWAITING_FABRICATION']
  return COMPLETABLE_STATUSES.includes(orderStatus)
}

/**
 * Validate vehicle type can be changed
 */
export function canChangeVehicle(orderStatus: string, userRole: string): boolean {
  const EDITABLE_STATUSES = ['PRICING_REVIEW', 'PENDING_APPROVAL']
  const ALLOWED_ROLES = ['ADMIN', 'LOGISTICS']
  return EDITABLE_STATUSES.includes(orderStatus) && ALLOWED_ROLES.includes(userRole)
}

/**
 * Validate if order should enter AWAITING_FABRICATION after quote approval
 */
export function shouldEnterFabrication(hasPendingReskins: boolean): boolean {
  return hasPendingReskins
}

/**
 * Get required fields for order submission
 */
export const REQUIRED_ORDER_FIELDS = [
  'items',
  'transport_trip_type',
  'event_start_date',
  'event_end_date',
  'venue_name',
  'venue_country',
  'venue_city',
  'venue_address',
  'contact_name',
  'contact_email',
  'contact_phone',
] as const

/**
 * Validate rebrand request fields
 */
export function validateRebrandRequest(item: any): { valid: boolean; error?: string } {
  if (!item.is_reskin_request) {
    return { valid: true }
  }

  if (!item.reskin_target_brand_id && !item.reskin_target_brand_custom) {
    return { valid: false, error: 'Rebrand requests require target brand' }
  }

  if (!item.reskin_notes || item.reskin_notes.trim().length < 10) {
    return { valid: false, error: 'Rebrand instructions must be at least 10 characters' }
  }

  return { valid: true }
}

/**
 * Validate trip type
 */
export function isValidTripType(tripType: string): boolean {
  return ['ONE_WAY', 'ROUND_TRIP'].includes(tripType)
}

/**
 * Validate vehicle type
 */
export function isValidVehicleType(vehicleType: string): boolean {
  return ['STANDARD', '7_TON', '10_TON'].includes(vehicleType)
}
