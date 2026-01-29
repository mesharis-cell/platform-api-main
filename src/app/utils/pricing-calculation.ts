// export async function calculateOrderPricing(
//     platformId: string,
//     companyId: string,
//     orderId: string,
//     volume: number,
//     emirate: string,
//     tripType: TripType,
//     vehicleType: VehicleType,
//     marginPercent: number,
//     marginOverride: boolean = false,
//     marginOverrideReason: string | null = null,
//     userId: string
// ): Promise<OrderPricingBreakdown> {
//     // Get warehouse ops rate
//     const warehouseOpsRate = await PricingConfigServices.getPricingConfig(platformId, companyId);

//     // Calculate base operations
//     const baseOpsTotal = volume * warehouseOpsRate;

//     // Get transport rate
//     const transportRate = await TransportRatesServices.lookupTransportRate(
//         platformId,
//         companyId,
//         emirate,
//         tripType,
//         vehicleType
//     );

//     // Get line items totals
//     const lineItemsTotals = await OrderLineItemsServices.calculateLineItemsTotals(
//         orderId,
//         platformId
//     );

//     // Calculate logistics subtotal (base ops + transport + catalog items)
//     const logisticsSubtotal = baseOpsTotal + transportRate + lineItemsTotals.catalog_total;

//     // Calculate margin (applied to logistics only)
//     const marginAmount = logisticsSubtotal * (marginPercent / 100);

//     // Final total
//     const finalTotal = logisticsSubtotal + marginAmount + lineItemsTotals.custom_total;

//     return {
//         base_operations: {
//             volume: parseFloat(volume.toFixed(3)),
//             rate: parseFloat(warehouseOpsRate.toFixed(2)),
//             total: parseFloat(baseOpsTotal.toFixed(2)),
//         },
//         transport: {
//             emirate,
//             trip_type: tripType,
//             vehicle_type: vehicleType,
//             system_rate: parseFloat(transportRate.toFixed(2)),
//             final_rate: parseFloat(transportRate.toFixed(2)),
//             vehicle_changed: vehicleType !== "STANDARD",
//             vehicle_change_reason: null, // To be set if vehicle was upgraded
//         },
//         line_items: {
//             catalog_total: lineItemsTotals.catalog_total,
//             custom_total: lineItemsTotals.custom_total,
//         },
//         logistics_subtotal: parseFloat(logisticsSubtotal.toFixed(2)),
//         margin: {
//             percent: parseFloat(marginPercent.toFixed(2)),
//             amount: parseFloat(marginAmount.toFixed(2)),
//             is_override: marginOverride,
//             override_reason: marginOverrideReason,
//         },
//         final_total: parseFloat(finalTotal.toFixed(2)),
//         calculated_at: new Date().toISOString(),
//         calculated_by: userId,
//     };
