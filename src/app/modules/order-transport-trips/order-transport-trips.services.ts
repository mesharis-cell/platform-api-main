import { and, asc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { orderTransportTrips, orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import {
    CreateOrderTransportTripPayload,
    UpdateOrderTransportTripPayload,
} from "./order-transport-trips.interfaces";

const assertOrderExists = async (orderId: string, platformId: string) => {
    const [order] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }
};

const listOrderTransportTrips = async (orderId: string, platformId: string) => {
    await assertOrderExists(orderId, platformId);

    return db
        .select()
        .from(orderTransportTrips)
        .where(
            and(
                eq(orderTransportTrips.order_id, orderId),
                eq(orderTransportTrips.platform_id, platformId)
            )
        )
        .orderBy(asc(orderTransportTrips.sequence_no), asc(orderTransportTrips.created_at));
};

const createOrderTransportTrip = async (payload: CreateOrderTransportTripPayload) => {
    await assertOrderExists(payload.order_id, payload.platform_id);

    const [created] = await db
        .insert(orderTransportTrips)
        .values({
            platform_id: payload.platform_id,
            order_id: payload.order_id,
            leg_type: payload.leg_type,
            truck_plate: payload.truck_plate || null,
            driver_name: payload.driver_name || null,
            driver_contact: payload.driver_contact || null,
            truck_size: payload.truck_size || null,
            manpower: payload.manpower ?? null,
            tailgate_required: payload.tailgate_required ?? false,
            notes: payload.notes || null,
            sequence_no: payload.sequence_no ?? 0,
            created_by: payload.created_by,
            updated_by: payload.created_by,
        })
        .returning();

    return created;
};

const updateOrderTransportTrip = async (
    orderId: string,
    tripId: string,
    platformId: string,
    payload: UpdateOrderTransportTripPayload
) => {
    await assertOrderExists(orderId, platformId);

    const [existing] = await db
        .select({ id: orderTransportTrips.id })
        .from(orderTransportTrips)
        .where(
            and(
                eq(orderTransportTrips.id, tripId),
                eq(orderTransportTrips.order_id, orderId),
                eq(orderTransportTrips.platform_id, platformId)
            )
        )
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Transport trip not found");
    }

    const [updated] = await db
        .update(orderTransportTrips)
        .set({
            ...(payload.leg_type !== undefined && { leg_type: payload.leg_type }),
            ...(payload.truck_plate !== undefined && { truck_plate: payload.truck_plate || null }),
            ...(payload.driver_name !== undefined && { driver_name: payload.driver_name || null }),
            ...(payload.driver_contact !== undefined && {
                driver_contact: payload.driver_contact || null,
            }),
            ...(payload.truck_size !== undefined && { truck_size: payload.truck_size || null }),
            ...(payload.manpower !== undefined && { manpower: payload.manpower }),
            ...(payload.tailgate_required !== undefined && {
                tailgate_required: payload.tailgate_required,
            }),
            ...(payload.notes !== undefined && { notes: payload.notes || null }),
            ...(payload.sequence_no !== undefined && { sequence_no: payload.sequence_no }),
            updated_by: payload.updated_by,
            updated_at: new Date(),
        })
        .where(eq(orderTransportTrips.id, tripId))
        .returning();

    return updated;
};

const deleteOrderTransportTrip = async (orderId: string, tripId: string, platformId: string) => {
    await assertOrderExists(orderId, platformId);

    const [deleted] = await db
        .delete(orderTransportTrips)
        .where(
            and(
                eq(orderTransportTrips.id, tripId),
                eq(orderTransportTrips.order_id, orderId),
                eq(orderTransportTrips.platform_id, platformId)
            )
        )
        .returning({ id: orderTransportTrips.id });

    if (!deleted) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Transport trip not found");
    }

    return deleted;
};

export const OrderTransportTripsServices = {
    listOrderTransportTrips,
    createOrderTransportTrip,
    updateOrderTransportTrip,
    deleteOrderTransportTrip,
};
