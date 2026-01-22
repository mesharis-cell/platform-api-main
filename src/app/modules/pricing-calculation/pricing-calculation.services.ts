/**
 * Pricing Calculation Service
 * Core pricing logic for hybrid pricing architecture
 */

import { PricingConfigServices } from '../pricing-config/pricing-config.services'
import { TransportRatesServices } from '../transport-rates/transport-rates.services'
import { OrderLineItemsServices } from '../order-line-items/order-line-items.services'

export interface OrderPricingBreakdown {
  base_operations: {
    volume: number
    rate: number
    total: number
  }
  transport: {
    emirate: string
    trip_type: string
    vehicle_type: string
    system_rate: number
    final_rate: number
    vehicle_changed: boolean
    vehicle_change_reason: string | null
  }
  line_items: {
    catalog_total: number
    custom_total: number
  }
  logistics_subtotal: number
  margin: {
    percent: number
    amount: number
    is_override: boolean
    override_reason: string | null
  }
  final_total: number
  calculated_at: string
  calculated_by: string
}

// ----------------------------------- DERIVE EMIRATE FROM CITY -----------------------------------
export function deriveEmirateFromCity(city: string): string {
  const cityLower = city.toLowerCase().trim()

  // Dubai
  if (cityLower.includes('dubai')) return 'Dubai'

  // Abu Dhabi
  if (
    cityLower.includes('abu dhabi') ||
    cityLower.includes('abudhabi') ||
    cityLower.includes('mussafah') ||
    cityLower.includes('khalifa city')
  )
    return 'Abu Dhabi'

  // Al Ain
  if (cityLower.includes('al ain') || cityLower.includes('alain')) return 'Al Ain'

  // Sharjah
  if (cityLower.includes('sharjah')) return 'Sharjah'

  // Ajman
  if (cityLower.includes('ajman')) return 'Ajman'

  // Ras Al Khaimah
  if (
    cityLower.includes('ras al khaimah') ||
    cityLower.includes('ras al-khaimah') ||
    cityLower.includes('rak')
  )
    return 'Ras Al Khaimah'

  // Umm Al Quwain
  if (
    cityLower.includes('umm al quwain') ||
    cityLower.includes('umm al-quwain') ||
    cityLower.includes('uaq')
  )
    return 'Umm Al Quwain'

  // Fujairah
  if (cityLower.includes('fujairah') || cityLower.includes('fujaira'))
    return 'Fujairah'

  // Default to Dubai if can't determine
  return 'Dubai'
}

// ----------------------------------- CALCULATE ORDER ESTIMATE -----------------------------------
/**
 * Calculate order estimate at submission time
 * Uses: base ops + transport (STANDARD) + margin
 * Excludes: line items (added during review)
 */
export async function calculateOrderEstimate(
  platformId: string,
  companyId: string,
  volume: number,
  venueCity: string,
  tripType: string,
  marginPercent: number
): Promise<{
  base_operations: { volume: number; rate: number; total: number }
  transport: { emirate: string; trip_type: string; vehicle_type: string; rate: number }
  logistics_subtotal: number
  margin: { percent: number; amount: number }
  estimate_total: number
}> {
  // Get warehouse ops rate
  const warehouseOpsRate = await PricingConfigServices.getPricingConfig(
    platformId,
    companyId
  )

  // Calculate base operations
  const baseOpsTotal = volume * warehouseOpsRate

  // Get transport rate (always STANDARD for estimate)
  const emirate = deriveEmirateFromCity(venueCity)
  const transportRate = await TransportRatesServices.getTransportRate(
    platformId,
    companyId,
    emirate,
    tripType,
    'STANDARD'
  )

  // Calculate logistics subtotal
  const logisticsSubtotal = baseOpsTotal + transportRate

  // Calculate margin
  const marginAmount = logisticsSubtotal * (marginPercent / 100)

  // Estimate total
  const estimateTotal = logisticsSubtotal + marginAmount

  return {
    base_operations: {
      volume: parseFloat(volume.toFixed(3)),
      rate: parseFloat(warehouseOpsRate.toFixed(2)),
      total: parseFloat(baseOpsTotal.toFixed(2)),
    },
    transport: {
      emirate,
      trip_type: tripType,
      vehicle_type: 'STANDARD',
      rate: parseFloat(transportRate.toFixed(2)),
    },
    logistics_subtotal: parseFloat(logisticsSubtotal.toFixed(2)),
    margin: {
      percent: parseFloat(marginPercent.toFixed(2)),
      amount: parseFloat(marginAmount.toFixed(2)),
    },
    estimate_total: parseFloat(estimateTotal.toFixed(2)),
  }
}

// ----------------------------------- CALCULATE ORDER PRICING -----------------------------------
/**
 * Calculate complete order pricing with all components
 * Used during pricing review and quote approval
 */
export async function calculateOrderPricing(
  platformId: string,
  companyId: string,
  orderId: string,
  volume: number,
  emirate: string,
  tripType: string,
  vehicleType: string,
  marginPercent: number,
  marginOverride: boolean = false,
  marginOverrideReason: string | null = null,
  userId: string
): Promise<OrderPricingBreakdown> {
  // Get warehouse ops rate
  const warehouseOpsRate = await PricingConfigServices.getPricingConfig(
    platformId,
    companyId
  )

  // Calculate base operations
  const baseOpsTotal = volume * warehouseOpsRate

  // Get transport rate
  const transportRate = await TransportRatesServices.getTransportRate(
    platformId,
    companyId,
    emirate,
    tripType,
    vehicleType
  )

  // Get line items totals
  const lineItemsTotals = await OrderLineItemsServices.calculateLineItemsTotals(
    orderId,
    platformId
  )

  // Calculate logistics subtotal (base ops + transport + catalog items)
  const logisticsSubtotal = baseOpsTotal + transportRate + lineItemsTotals.catalog_total

  // Calculate margin (applied to logistics only)
  const marginAmount = logisticsSubtotal * (marginPercent / 100)

  // Final total
  const finalTotal = logisticsSubtotal + marginAmount + lineItemsTotals.custom_total

  return {
    base_operations: {
      volume: parseFloat(volume.toFixed(3)),
      rate: parseFloat(warehouseOpsRate.toFixed(2)),
      total: parseFloat(baseOpsTotal.toFixed(2)),
    },
    transport: {
      emirate,
      trip_type: tripType,
      vehicle_type: vehicleType,
      system_rate: parseFloat(transportRate.toFixed(2)),
      final_rate: parseFloat(transportRate.toFixed(2)),
      vehicle_changed: vehicleType !== 'STANDARD',
      vehicle_change_reason: null, // To be set if vehicle was upgraded
    },
    line_items: {
      catalog_total: lineItemsTotals.catalog_total,
      custom_total: lineItemsTotals.custom_total,
    },
    logistics_subtotal: parseFloat(logisticsSubtotal.toFixed(2)),
    margin: {
      percent: parseFloat(marginPercent.toFixed(2)),
      amount: parseFloat(marginAmount.toFixed(2)),
      is_override: marginOverride,
      override_reason: marginOverrideReason,
    },
    final_total: parseFloat(finalTotal.toFixed(2)),
    calculated_at: new Date().toISOString(),
    calculated_by: userId,
  }
}

export const PricingCalculationServices = {
  deriveEmirateFromCity,
  calculateOrderEstimate,
  calculateOrderPricing,
}
