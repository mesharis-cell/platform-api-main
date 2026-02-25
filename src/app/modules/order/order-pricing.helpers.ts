/**
 * Order Pricing Helper Functions
 * Extracted from order.services.ts for hybrid pricing system
 */

import { db } from "../../../db";
import { orders } from "../../../db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Calculate and store pricing estimate at order submission
 */
// export async function calculateAndStoreEstimate(
//     orderId: string,
//     platformId: string,
//     companyId: string,
//     volume: number,
//     venueCity: string,
//     tripType: string,
//     userId: string
// ) {
//     // Get company margin
//     const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);

//     const marginPercent = parseFloat(company.platform_margin_percent);

//     // Calculate estimate
//     const estimate = await PricingCalculationServices.calculateOrderEstimate(
//         platformId,
//         companyId,
//         volume,
//         venueCity,
//         tripType,
//         marginPercent
//     );

//     // Derive emirate for storage
//     const emirate = PricingCalculationServices.deriveEmirateFromCity(venueCity);

//     // Create initial pricing structure
//     const pricing = {
//         base_operations: estimate.base_operations,
//         transport: {
//             emirate,
//             trip_type: tripType,
//             vehicle_type: "STANDARD",
//             system_rate: estimate.transport.rate,
//             final_rate: estimate.transport.rate,
//             vehicle_changed: false,
//             vehicle_change_reason: null,
//         },
//         line_items: {
//             catalog_total: 0,
//             custom_total: 0,
//         },
//         logistics_subtotal: estimate.logistics_subtotal,
//         margin: {
//             percent: estimate.margin.percent,
//             amount: estimate.margin.amount,
//             is_override: false,
//             override_reason: null,
//         },
//         final_total: estimate.estimate_total,
//         calculated_at: new Date().toISOString(),
//         calculated_by: userId,
//     };

//     // Update order with pricing
//     // await db
//     //     .update(orders)
//     //     .set({
//     //         pricing: pricing as any,
//     //     })
//     //     .where(eq(orders.id, orderId));

//     return pricing;
// }

/**
 * Recalculate order pricing (called after line items change)
 */
export async function recalculateOrderPricing(
    orderId: string,
    platformId: string,
    companyId: string,
    userId: string
) {
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new Error("Order not found");
    }

    // const volume = parseFloat((order.calculated_totals as any).volume);
    // const emirate = PricingCalculationServices.deriveEmirateFromCity(
    //     (order.venue_location as any).city
    // );

    // Get current margin
    // const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    // const existingPricing = order.pricing as any;
    // const marginOverride = !!existingPricing?.margin?.is_override;
    // const marginPercent = marginOverride
    //     ? parseFloat(existingPricing.margin.percent)
    //     : parseFloat(company.platform_margin_percent);
    // const marginOverrideReason = marginOverride ? existingPricing.margin.override_reason : null;

    // Calculate new pricing
    // const newPricing = await PricingCalculationServices.calculateOrderPricing(
    //     platformId,
    //     companyId,
    //     orderId,
    //     volume,
    //     emirate,
    //     order.transport_trip_type,
    //     order.transport_vehicle_type,
    //     // marginPercent,
    //     // marginOverride,
    //     // marginOverrideReason,
    //     userId
    // );

    // Update order
    // await db
    //     .update(orders)
    //     .set({
    //         pricing: newPricing as any,
    //     })
    //     .where(eq(orders.id, orderId));

    // return newPricing;
}
