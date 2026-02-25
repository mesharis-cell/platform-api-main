import { and, eq, ilike, or, desc, count } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assets, assetBookings, orders, selfBookings, selfBookingItems } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { eventBus } from "../../events/event-bus";
import { EVENT_TYPES } from "../../events/event-types";
import type { AuthUser } from "../../interface/common";

// ----------------------------------- CREATE -----------------------------------
const createSelfBooking = async (
    user: AuthUser,
    platformId: string,
    payload: {
        booked_for: string;
        reason?: string;
        job_reference?: string;
        notes?: string;
        items: { asset_id: string; quantity: number }[];
    }
) => {
    const { booked_for, reason, job_reference, notes, items } = payload;

    // Validate each asset and check availability
    for (const item of items) {
        const asset = await db.query.assets.findFirst({
            where: and(eq(assets.id, item.asset_id), eq(assets.platform_id, platformId)),
        });

        if (!asset)
            throw new CustomizedError(httpStatus.NOT_FOUND, `Asset ${item.asset_id} not found`);

        const totalQuantity = asset.total_quantity;

        // Sum order-based bookings (active orders)
        const orderBookings = await db
            .select({ qty: assetBookings.quantity })
            .from(assetBookings)
            .innerJoin(orders, eq(assetBookings.order_id, orders.id))
            .where(
                and(
                    eq(assetBookings.asset_id, item.asset_id),
                    or(
                        eq(orders.order_status, "CONFIRMED"),
                        eq(orders.order_status, "IN_PREPARATION"),
                        eq(orders.order_status, "READY_FOR_DELIVERY"),
                        eq(orders.order_status, "IN_TRANSIT"),
                        eq(orders.order_status, "DELIVERED"),
                        eq(orders.order_status, "IN_USE"),
                        eq(orders.order_status, "AWAITING_RETURN")
                    )
                )
            );

        const orderBookedQty = orderBookings.reduce((s, b) => s + b.qty, 0);

        // Sum existing self-bookings (OUT items)
        const selfBooked = await db
            .select({
                qty: selfBookingItems.quantity,
                returned: selfBookingItems.returned_quantity,
            })
            .from(selfBookingItems)
            .where(
                and(
                    eq(selfBookingItems.asset_id, item.asset_id),
                    eq(selfBookingItems.status, "OUT")
                )
            );

        const selfBookedQty = selfBooked.reduce((s, b) => s + b.qty - b.returned, 0);

        const available = totalQuantity - orderBookedQty - selfBookedQty;

        if (item.quantity > available) {
            throw new CustomizedError(
                httpStatus.CONFLICT,
                `Insufficient availability for asset "${asset.name}". Available: ${available}, requested: ${item.quantity}`
            );
        }
    }

    // Create booking header + items in a transaction
    const result = await db.transaction(async (tx) => {
        const [booking] = await tx
            .insert(selfBookings)
            .values({
                platform_id: platformId,
                booked_for,
                reason: reason || null,
                job_reference: job_reference || null,
                notes: notes || null,
                status: "ACTIVE",
                created_by: user.id,
            })
            .returning();

        await tx.insert(selfBookingItems).values(
            items.map((item) => ({
                self_booking_id: booking.id,
                asset_id: item.asset_id,
                quantity: item.quantity,
                returned_quantity: 0,
                status: "OUT" as const,
            }))
        );

        return booking;
    });

    const created = await getSelfBookingById(result.id, platformId);

    eventBus
        .emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.SELF_BOOKING_CREATED,
            entity_type: "SELF_BOOKING",
            entity_id: created.id,
            actor_id: user.id,
            actor_role: "ADMIN",
            payload: {
                booked_for: created.booked_for,
                job_reference: created.job_reference ?? undefined,
                reason: created.reason ?? undefined,
                item_count: created.items.length,
                total_units: created.items.reduce((s, i) => s + i.quantity, 0),
                created_by_name: created.created_by_user?.name ?? user.email,
            },
        })
        .catch(() => {});

    return created;
};

// ----------------------------------- LIST -----------------------------------
const listSelfBookings = async (
    query: {
        status?: "ACTIVE" | "COMPLETED" | "CANCELLED";
        search?: string;
        page?: number;
        limit?: number;
    },
    platformId: string
) => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(selfBookings.platform_id, platformId)];
    if (query.status) conditions.push(eq(selfBookings.status, query.status));
    if (query.search) {
        conditions.push(
            or(
                ilike(selfBookings.booked_for, `%${query.search}%`),
                ilike(selfBookings.job_reference, `%${query.search}%`)
            ) as any
        );
    }

    const whereClause = and(...conditions);

    const [{ total }] = await db.select({ total: count() }).from(selfBookings).where(whereClause);

    const rows = await db.query.selfBookings.findMany({
        where: whereClause,
        orderBy: [desc(selfBookings.created_at)],
        limit,
        offset,
        with: {
            created_by_user: { columns: { id: true, name: true, email: true } },
            items: {
                columns: { id: true, quantity: true, returned_quantity: true, status: true },
                with: { asset: { columns: { id: true, name: true } } },
            },
        },
    });

    return {
        data: rows,
        meta: {
            total,
            page,
            limit,
            total_pages: Math.ceil(total / limit),
        },
    };
};

// ----------------------------------- GET BY ID -----------------------------------
const getSelfBookingById = async (id: string, platformId: string) => {
    const booking = await db.query.selfBookings.findFirst({
        where: and(eq(selfBookings.id, id), eq(selfBookings.platform_id, platformId)),
        with: {
            created_by_user: { columns: { id: true, name: true, email: true } },
            cancelled_by_user: { columns: { id: true, name: true, email: true } },
            items: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            qr_code: true,
                            category: true,
                            tracking_method: true,
                        },
                    },
                },
            },
        },
    });

    if (!booking) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-booking not found");

    return booking;
};

// ----------------------------------- RETURN SCAN -----------------------------------
const returnScan = async (
    id: string,
    platformId: string,
    payload: { qr_code: string; quantity?: number }
) => {
    const booking = await db.query.selfBookings.findFirst({
        where: and(eq(selfBookings.id, id), eq(selfBookings.platform_id, platformId)),
        with: { items: true },
    });

    if (!booking) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-booking not found");
    if (booking.status !== "ACTIVE")
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Self-booking is not active");

    // Resolve QR code → asset
    const asset = await db.query.assets.findFirst({
        where: eq(assets.qr_code, payload.qr_code),
        columns: { id: true, name: true },
    });

    if (!asset)
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            `No asset found for QR code: ${payload.qr_code}`
        );

    // Find the matching item in this booking
    const item = booking.items.find((i) => i.asset_id === asset.id && i.status === "OUT");

    if (!item)
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Asset "${asset.name}" is not in this booking or already returned`
        );

    const quantityToReturn = payload.quantity ?? 1;
    const maxReturnable = item.quantity - item.returned_quantity;

    if (quantityToReturn > maxReturnable) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot return ${quantityToReturn} — only ${maxReturnable} remaining`
        );
    }

    const newReturnedQty = item.returned_quantity + quantityToReturn;
    const itemFullyReturned = newReturnedQty >= item.quantity;

    await db.transaction(async (tx) => {
        await tx
            .update(selfBookingItems)
            .set({
                returned_quantity: newReturnedQty,
                status: itemFullyReturned ? "RETURNED" : "OUT",
                returned_at: itemFullyReturned ? new Date() : null,
            })
            .where(eq(selfBookingItems.id, item.id));

        // Check if all items are returned (re-query after update to get fresh state)
        const allItems = await tx
            .select({ id: selfBookingItems.id, status: selfBookingItems.status })
            .from(selfBookingItems)
            .where(eq(selfBookingItems.self_booking_id, id));

        const allReturned = allItems.every((i) => i.status === "RETURNED");

        if (allReturned) {
            await tx
                .update(selfBookings)
                .set({ status: "COMPLETED", completed_at: new Date() })
                .where(eq(selfBookings.id, id));
        }
    });

    const updated = await getSelfBookingById(id, platformId);

    if (updated.status === "COMPLETED") {
        eventBus
            .emit({
                platform_id: platformId,
                event_type: EVENT_TYPES.SELF_BOOKING_COMPLETED,
                entity_type: "SELF_BOOKING",
                entity_id: id,
                actor_id: null,
                actor_role: null,
                payload: {
                    booked_for: updated.booked_for,
                    job_reference: updated.job_reference ?? undefined,
                    item_count: updated.items.length,
                    total_units: updated.items.reduce((s, i) => s + i.quantity, 0),
                },
            })
            .catch(() => {});
    }

    return updated;
};

// ----------------------------------- CANCEL -----------------------------------
const cancelSelfBooking = async (
    id: string,
    platformId: string,
    userId: string,
    payload: { cancellation_reason?: string }
) => {
    const booking = await db.query.selfBookings.findFirst({
        where: and(eq(selfBookings.id, id), eq(selfBookings.platform_id, platformId)),
    });

    if (!booking) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-booking not found");
    if (booking.status !== "ACTIVE")
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Only active bookings can be cancelled");

    await db.transaction(async (tx) => {
        await tx
            .update(selfBookings)
            .set({
                status: "CANCELLED",
                cancelled_at: new Date(),
                cancelled_by: userId,
                cancellation_reason: payload.cancellation_reason || null,
            })
            .where(eq(selfBookings.id, id));

        await tx
            .update(selfBookingItems)
            .set({ status: "RETURNED", returned_at: new Date() })
            .where(
                and(eq(selfBookingItems.self_booking_id, id), eq(selfBookingItems.status, "OUT"))
            );
    });

    const cancelled = await getSelfBookingById(id, platformId);

    eventBus
        .emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.SELF_BOOKING_CANCELLED,
            entity_type: "SELF_BOOKING",
            entity_id: id,
            actor_id: userId,
            actor_role: "ADMIN",
            payload: {
                booked_for: cancelled.booked_for,
                job_reference: cancelled.job_reference ?? undefined,
                cancellation_reason: payload.cancellation_reason ?? undefined,
                cancelled_by_name: cancelled.cancelled_by_user?.name ?? userId,
            },
        })
        .catch(() => {});

    return cancelled;
};

export const SelfBookingsServices = {
    createSelfBooking,
    listSelfBookings,
    getSelfBookingById,
    returnScan,
    cancelSelfBooking,
};
