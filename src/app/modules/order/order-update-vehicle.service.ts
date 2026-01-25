/**
 * Order Vehicle Update Service
 * Handle vehicle type upgrades during pricing review
 */

import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { TransportRatesServices } from "../transport-rates/transport-rates.services";
import { PricingCalculationServices } from "../pricing-calculation/pricing-calculation.services";

export interface UpdateVehiclePayload {
    vehicle_type: "STANDARD" | "7_TON" | "10_TON";
    reason: string;
}

/**
 * Update order vehicle type and recalculate transport rate
 */
export async function updateOrderVehicle(
    orderId: string,
    platformId: string,
    payload: UpdateVehiclePayload,
    userId: string
) {
    const { vehicle_type, reason } = payload;

    // Validate reason if changing vehicle
    if (!reason || reason.trim().length < 10) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Vehicle change reason is required (min 10 characters)"
        );
    }

    // Get order
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Validate order status
    if (!["PRICING_REVIEW", "PENDING_APPROVAL"].includes(order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Vehicle type can only be changed during pricing review"
        );
    }

    // Get new transport rate
    const emirate = PricingCalculationServices.deriveEmirateFromCity(
        (order.venue_location as any).city
    );
    const newRate = await TransportRatesServices.getTransportRate(
        platformId,
        order.company_id,
        emirate,
        order.transport_trip_type,
        vehicle_type
    );

    // Update order
    await db
        .update(orders)
        .set({
            transport_vehicle_type: vehicle_type as any,
            // Update pricing JSONB if it exists
            pricing: order.pricing
                ? {
                      ...(order.pricing as any),
                      transport: {
                          ...(order.pricing as any).transport,
                          vehicle_type,
                          final_rate: newRate,
                          vehicle_changed: vehicle_type !== "STANDARD",
                          vehicle_change_reason: reason.trim(),
                      },
                  }
                : null,
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    return {
        vehicle_type,
        new_rate: newRate,
        reason: reason.trim(),
    };
}

export const OrderVehicleService = {
    updateOrderVehicle,
};
