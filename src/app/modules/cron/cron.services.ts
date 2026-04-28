import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
    financialStatusHistory,
    orders,
    orderStatusHistory,
    otp,
    selfPickups,
    selfPickupStatusHistory,
    systemEvents,
} from "../../../db/schema";
import { getSystemUser } from "../../utils/helper-query";
import { eventBus, EVENT_TYPES } from "../../events";

/**
 * Unified cron job to handle both event start and event end transitions
 * - Event Start: DELIVERED → IN_USE (when event_start_date = today)
 * - Event End: IN_USE → AWAITING_RETURN (when event_end_date = today)
 */
const transitionOrdersBasedOnEventDates = async () => {
    try {
        // Step 1: Get today's date (without time component)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split("T")[0];

        // Step 2: Find orders for both event start and event end transitions
        const [ordersForEventStart, ordersForEventEnd] = await Promise.all([
            // Event Start: DELIVERED → IN_USE
            db.query.orders.findMany({
                where: and(
                    eq(orders.order_status, "DELIVERED"),
                    sql`DATE(${orders.event_start_date}) = ${todayStr}`
                ),
            }),
            // Event End: IN_USE → AWAITING_RETURN
            db.query.orders.findMany({
                where: and(
                    eq(orders.order_status, "IN_USE"),
                    sql`DATE(${orders.event_end_date}) = ${todayStr}`
                ),
            }),
        ]);

        // Step 3: Early return if no orders to update
        const totalOrders = ordersForEventStart.length + ordersForEventEnd.length;
        if (totalOrders === 0) {
            console.log("✅ Event cron: No orders to update");
            return;
        }

        // Step 4: Combine and group all orders by platform_id
        const allOrdersWithTransition = [
            ...ordersForEventStart.map((order) => ({
                order,
                newStatus: "IN_USE" as const,
                reason: "event start",
            })),
            ...ordersForEventEnd.map((order) => ({
                order,
                newStatus: "AWAITING_RETURN" as const,
                reason: "event end",
            })),
        ];

        const ordersByPlatform = allOrdersWithTransition.reduce(
            (acc, { order, newStatus, reason }) => {
                if (!acc[order.platform_id]) {
                    acc[order.platform_id] = [];
                }
                acc[order.platform_id].push({ order, newStatus, reason });
                return acc;
            },
            {} as Record<
                string,
                Array<{
                    order: (typeof ordersForEventStart)[0];
                    newStatus: "IN_USE" | "AWAITING_RETURN";
                    reason: string;
                }>
            >
        );

        let eventStartCount = 0;
        let eventEndCount = 0;
        const statusHistoryEntries: Array<{
            platform_id: string;
            order_id: string;
            status: "IN_USE" | "AWAITING_RETURN";
            notes: string;
            updated_by: string;
        }> = [];

        // Step 5: Process orders grouped by platform
        for (const [platformId, platformOrdersWithTransition] of Object.entries(ordersByPlatform)) {
            // Step 5a: Get system user once per platform
            const systemUser = await getSystemUser(platformId);

            if (!systemUser) {
                console.error(
                    `❌ No system user found for platform ID: ${platformId}. Skipping ${platformOrdersWithTransition.length} orders.`
                );
                continue;
            }

            // Step 5b: Group by status transition for batch updates
            const ordersByStatus = platformOrdersWithTransition.reduce(
                (acc, item) => {
                    if (!acc[item.newStatus]) {
                        acc[item.newStatus] = [];
                    }
                    acc[item.newStatus].push(item);
                    return acc;
                },
                {} as Record<string, typeof platformOrdersWithTransition>
            );

            // Step 5c: Batch update orders for each status
            for (const [newStatus, items] of Object.entries(ordersByStatus)) {
                const orderIds = items.map((item) => item.order.id);

                await db
                    .update(orders)
                    .set({
                        order_status: newStatus as "IN_USE" | "AWAITING_RETURN",
                        updated_at: new Date(),
                    })
                    .where(sql`${orders.id} = ANY(${orderIds})`);

                // Step 5d: Prepare status history entries
                for (const item of items) {
                    statusHistoryEntries.push({
                        platform_id: item.order.platform_id,
                        order_id: item.order.id,
                        status: item.newStatus,
                        notes: `Automatic transition on event ${item.reason} date`,
                        updated_by: systemUser.id,
                    });

                    // Track counts
                    if (item.newStatus === "IN_USE") {
                        eventStartCount++;
                    } else {
                        eventEndCount++;
                    }
                }
            }
        }

        // Step 6: Batch insert all status history entries
        if (statusHistoryEntries.length > 0) {
            await db.insert(orderStatusHistory).values(statusHistoryEntries);
        }

        // Step 7: Log success
        console.log(
            `✅ Event cron completed: ${eventStartCount} orders → IN_USE, ${eventEndCount} orders → AWAITING_RETURN`
        );
    } catch (error: any) {
        console.error("❌ Event cron error:", error);
        throw error;
    }
};

/**
 * Cron job to send pickup reminders for orders with pickup windows within 48 hours
 * - Finds orders with status IN_USE or AWAITING_RETURN
 * - Checks if pickup window start is within the next 48 hours
 * - Sends PICKUP_REMINDER notification if not already sent
 */
const sendPickupReminders = async () => {
    try {
        // Step 1: Calculate time window (now to 48 hours from now)
        const now = new Date();
        const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        // Step 2: Find orders with pickup windows within 48 hours
        const ordersForReminder = await db.query.orders.findMany({
            where: and(
                or(eq(orders.order_status, "IN_USE"), eq(orders.order_status, "AWAITING_RETURN")),
                sql`(${orders.pickup_window}->>'start')::timestamp >= ${now.toISOString()}`,
                sql`(${orders.pickup_window}->>'start')::timestamp <= ${in48Hours.toISOString()}`
            ),
            with: {
                company: {
                    columns: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        // Step 3: Early return if no orders need reminders
        if (ordersForReminder.length === 0) {
            console.log("✅ Pickup reminder cron: No orders need reminders");
            return;
        }

        // Step 4: Group orders by platform for efficient processing
        const ordersByPlatform = ordersForReminder.reduce(
            (acc, order) => {
                if (!acc[order.platform_id]) {
                    acc[order.platform_id] = [];
                }
                acc[order.platform_id].push(order);
                return acc;
            },
            {} as Record<string, typeof ordersForReminder>
        );

        let remindersSent = 0;
        let remindersSkipped = 0;

        // Step 5: Process orders grouped by platform
        for (const [platformId, platformOrders] of Object.entries(ordersByPlatform)) {
            console.log(`📧 Processing ${platformOrders.length} orders for platform ${platformId}`);

            // Step 5a: Send notification for each order (with idempotency)
            for (const order of platformOrders) {
                try {
                    // Check if pickup_window exists and has a start time
                    const pickupWindow = order.pickup_window as any;
                    if (!pickupWindow || !pickupWindow.start) {
                        console.log(
                            `   ⚠ Skipping order ${order.order_id}: No pickup window defined`
                        );
                        remindersSkipped++;
                        continue;
                    }

                    // Idempotency: Check if pickup reminder event was already fired
                    const [existingEvent] = await db
                        .select()
                        .from(systemEvents)
                        .where(
                            and(
                                eq(systemEvents.entity_id, order.id),
                                eq(systemEvents.event_type, EVENT_TYPES.ORDER_PICKUP_REMINDER)
                            )
                        )
                        .limit(1);

                    if (existingEvent) {
                        console.log(
                            `   ⚠ Skipping order ${order.order_id}: Pickup reminder already sent`
                        );
                        remindersSkipped++;
                        continue;
                    }

                    // Emit pickup reminder event
                    const pickupWindowStr = pickupWindow.start
                        ? `${new Date(pickupWindow.start).toLocaleDateString()} – ${new Date(pickupWindow.end || pickupWindow.start).toLocaleDateString()}`
                        : "TBD";

                    await eventBus.emit({
                        platform_id: platformId,
                        event_type: EVENT_TYPES.ORDER_PICKUP_REMINDER,
                        entity_type: "ORDER",
                        entity_id: order.id,
                        actor_id: null,
                        actor_role: "SYSTEM",
                        payload: {
                            entity_id_readable: order.order_id,
                            company_id: order.company_id,
                            company_name: (order.company as any)?.name || "N/A",
                            contact_name: order.contact_name,
                            venue_name: order.venue_name,
                            pickup_window: pickupWindowStr,
                            order_url: "",
                        },
                    });

                    remindersSent++;
                } catch (error: any) {
                    console.error(
                        `   ❌ Failed to send reminder for order ${order.order_id}:`,
                        error.message
                    );
                    remindersSkipped++;
                }
            }
        }

        // Step 6: Log summary
        console.log(
            `✅ Pickup reminder cron completed: ${remindersSent} reminders sent, ${remindersSkipped} skipped`
        );
    } catch (error: any) {
        console.error("❌ Pickup reminder cron error:", error);
        throw error;
    }
};

/**
 * Cron job to delete expired OTPs from the database
 * - Finds all OTP records where expires_at is less than current time
 * - Deletes expired OTPs to maintain database hygiene
 * - Runs periodically to clean up wastage/expired OTPs
 */
const deleteExpiredOTPs = async () => {
    try {
        // Step 1: Get current timestamp
        const now = new Date();

        // Step 2: Delete all expired OTPs
        const result = await db
            .delete(otp)
            .where(lt(otp.expires_at, now))
            .returning({ id: otp.id });

        // Step 3: Log results
        const deletedCount = result.length;

        if (deletedCount === 0) {
            console.log("✅ OTP cleanup cron: No expired OTPs to delete");
        } else {
            console.log(`✅ OTP cleanup cron completed: ${deletedCount} expired OTP(s) deleted`);
        }

        return {
            deletedCount,
            timestamp: now.toISOString(),
        };
    } catch (error: any) {
        console.error("❌ OTP cleanup cron error:", error);
        throw error;
    }
};

/**
 * Cron job to auto-transition self-pickups to AWAITING_RETURN when expected_return_at
 * has passed. Pickups in PICKED_UP status with expected_return_at < now() are
 * transitioned. Client can also trigger this early via the "Start Return" button.
 * (IN_USE was removed from the enum in migration 0044 — see CLAUDE.md gotcha #35.)
 */
const transitionSelfPickupReturns = async () => {
    try {
        const now = new Date();

        const pickupsForReturn = await db.query.selfPickups.findMany({
            where: and(
                eq(selfPickups.self_pickup_status, "PICKED_UP"),
                lt(selfPickups.expected_return_at, now)
            ),
        });

        if (pickupsForReturn.length === 0) {
            console.log("✅ Self-pickup return cron: No pickups to transition");
            return;
        }

        const pickupsByPlatform = pickupsForReturn.reduce(
            (acc, pickup) => {
                if (!acc[pickup.platform_id]) acc[pickup.platform_id] = [];
                acc[pickup.platform_id].push(pickup);
                return acc;
            },
            {} as Record<string, typeof pickupsForReturn>
        );

        let transitioned = 0;

        for (const [platformId, platformPickups] of Object.entries(pickupsByPlatform)) {
            const systemUser = await getSystemUser(platformId);
            if (!systemUser) {
                console.error(
                    `❌ No system user for platform ${platformId}. Skipping ${platformPickups.length} pickups.`
                );
                continue;
            }

            const pickupIds = platformPickups.map((p) => p.id);

            await db
                .update(selfPickups)
                .set({
                    self_pickup_status: "AWAITING_RETURN",
                    updated_at: new Date(),
                })
                .where(sql`${selfPickups.id} = ANY(${pickupIds})`);

            const historyEntries = platformPickups.map((pickup) => ({
                platform_id: pickup.platform_id,
                self_pickup_id: pickup.id,
                status: "AWAITING_RETURN" as const,
                notes: "Automatic transition — expected return date passed",
                updated_by: systemUser.id,
            }));

            await db.insert(selfPickupStatusHistory).values(historyEntries);

            for (const pickup of platformPickups) {
                const payload = {
                    entity_id_readable: pickup.self_pickup_id,
                    company_id: pickup.company_id,
                    company_name: "",
                    collector_name: pickup.collector_name,
                    collector_phone: pickup.collector_phone,
                    pickup_window: pickup.pickup_window,
                };
                await eventBus.emit({
                    platform_id: platformId,
                    event_type: EVENT_TYPES.SELF_PICKUP_RETURN_DUE,
                    entity_type: "SELF_PICKUP",
                    entity_id: pickup.id,
                    actor_id: systemUser.id,
                    actor_role: "SYSTEM",
                    payload,
                });
                // Also emit the generic SELF_PICKUP_STATUS_CHANGED so
                // audit / cache-invalidation listeners fire on the cron
                // transition. Mirrors transitionStatus() pattern.
                await eventBus.emit({
                    platform_id: platformId,
                    event_type: EVENT_TYPES.SELF_PICKUP_STATUS_CHANGED,
                    entity_type: "SELF_PICKUP",
                    entity_id: pickup.id,
                    actor_id: systemUser.id,
                    actor_role: "SYSTEM",
                    payload: {
                        ...payload,
                        old_status: "PICKED_UP",
                        new_status: "AWAITING_RETURN",
                        notes: "Automatic transition — expected return date passed",
                    },
                });
                transitioned++;
            }
        }

        console.log(
            `✅ Self-pickup return cron completed: ${transitioned} pickups → AWAITING_RETURN`
        );
    } catch (error: any) {
        console.error("❌ Self-pickup return cron error:", error);
        throw error;
    }
};

/**
 * Cancel orders + self-pickups stuck in pre-CONFIRMED states for more than
 * 30 days. Releases their asset bookings so the inventory frees up.
 *
 * Why this exists: when client portal users abandon a quote (or a quote sits
 * un-actioned), the entity stays in SUBMITTED / PRICING_REVIEW /
 * PENDING_APPROVAL / QUOTED with bookings holding stock. Without this cron,
 * inventory rots indefinitely. SP already books at submit (live since
 * 2026-04-22 on Red Bull); orders move to submit-time booking in a follow-up
 * PR. Lands now so both entity types are protected from day one of that flip.
 *
 * Idempotent on re-run: only acts on rows still in the stuck statuses, so
 * re-invoking the cron after a successful run is a no-op for processed rows.
 */
const expireStuckQuotes = async () => {
    try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const stuckOrderStatuses = [
            "SUBMITTED",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
        ] as const;
        const stuckPickupStatuses = [
            "SUBMITTED",
            "PRICING_REVIEW",
            "PENDING_APPROVAL",
            "QUOTED",
        ] as const;

        const [stuckOrders, stuckPickups] = await Promise.all([
            db.query.orders.findMany({
                where: and(
                    inArray(orders.order_status, stuckOrderStatuses as any),
                    lt(orders.updated_at, cutoff)
                ),
                columns: {
                    id: true,
                    order_id: true,
                    platform_id: true,
                    company_id: true,
                    contact_name: true,
                    order_status: true,
                },
            }),
            db.query.selfPickups.findMany({
                where: and(
                    inArray(selfPickups.self_pickup_status, stuckPickupStatuses as any),
                    lt(selfPickups.updated_at, cutoff)
                ),
                columns: {
                    id: true,
                    self_pickup_id: true,
                    platform_id: true,
                    company_id: true,
                    self_pickup_status: true,
                },
            }),
        ]);

        if (stuckOrders.length === 0 && stuckPickups.length === 0) {
            console.log("✅ Stuck-quote expiry cron: nothing to expire");
            return;
        }

        // Dynamic import — order.utils imports from order modules that may
        // create cycles when pulled at module-init. Mirrors the existing
        // pattern in self-pickup.services.ts:cancelSelfPickup.
        const { releaseBookingsAndRestoreAvailability } = await import("../order/order.utils");

        // Process orders.
        for (const order of stuckOrders) {
            const systemUser = await getSystemUser(order.platform_id);
            if (!systemUser) {
                console.warn(
                    `⚠️ Stuck-quote expiry: no system user for platform ${order.platform_id}, skipping order ${order.id}`
                );
                continue;
            }

            const previousStatus = order.order_status;
            const note = `Auto-expired after 30 days in ${previousStatus}`;

            await db.transaction(async (tx) => {
                // Release first so available_quantity is restored even if
                // the status update somehow fails downstream. Today this is
                // a no-op for orders (no bookings until CONFIRMED) but
                // future-proof for the submit-time-booking move.
                await releaseBookingsAndRestoreAvailability(
                    tx,
                    "ORDER",
                    order.id,
                    order.platform_id
                );

                await tx
                    .update(orders)
                    .set({
                        order_status: "CANCELLED",
                        financial_status: "CANCELLED",
                        updated_at: new Date(),
                    })
                    .where(eq(orders.id, order.id));

                await tx.insert(orderStatusHistory).values({
                    platform_id: order.platform_id,
                    order_id: order.id,
                    status: "CANCELLED",
                    notes: note,
                    updated_by: systemUser.id,
                });

                await tx.insert(financialStatusHistory).values({
                    platform_id: order.platform_id,
                    order_id: order.id,
                    status: "CANCELLED",
                    notes: note,
                    updated_by: systemUser.id,
                });
            });

            await eventBus.emit({
                platform_id: order.platform_id,
                event_type: EVENT_TYPES.ORDER_CANCELLED,
                entity_type: "ORDER",
                entity_id: order.id,
                actor_id: systemUser.id,
                actor_role: "SYSTEM",
                payload: {
                    entity_id_readable: order.order_id,
                    company_id: order.company_id,
                    contact_name: order.contact_name,
                    cancellation_reason: "AUTO_EXPIRED",
                    cancellation_notes: note,
                    suppress_entity_owner: false,
                    order_url: "",
                },
            });
        }

        // Process self-pickups.
        for (const pickup of stuckPickups) {
            const systemUser = await getSystemUser(pickup.platform_id);
            if (!systemUser) {
                console.warn(
                    `⚠️ Stuck-quote expiry: no system user for platform ${pickup.platform_id}, skipping pickup ${pickup.id}`
                );
                continue;
            }

            const previousStatus = pickup.self_pickup_status;
            const note = `Auto-expired after 30 days in ${previousStatus}`;

            await db.transaction(async (tx) => {
                await releaseBookingsAndRestoreAvailability(
                    tx,
                    "SELF_PICKUP",
                    pickup.id,
                    pickup.platform_id
                );

                await tx
                    .update(selfPickups)
                    .set({
                        self_pickup_status: "CANCELLED",
                        financial_status: "CANCELLED",
                        updated_at: new Date(),
                    })
                    .where(eq(selfPickups.id, pickup.id));

                await tx.insert(selfPickupStatusHistory).values({
                    platform_id: pickup.platform_id,
                    self_pickup_id: pickup.id,
                    status: "CANCELLED",
                    notes: note,
                    updated_by: systemUser.id,
                });
            });

            await eventBus.emit({
                platform_id: pickup.platform_id,
                event_type: EVENT_TYPES.SELF_PICKUP_CANCELLED,
                entity_type: "SELF_PICKUP",
                entity_id: pickup.id,
                actor_id: systemUser.id,
                actor_role: "SYSTEM",
                payload: {
                    entity_id_readable: pickup.self_pickup_id,
                    company_id: pickup.company_id,
                    cancellation_reason: "AUTO_EXPIRED",
                    cancellation_notes: note,
                    suppress_entity_owner: false,
                },
            });
        }

        console.log(
            `✅ Stuck-quote expiry cron: cancelled ${stuckOrders.length} order(s) + ${stuckPickups.length} self-pickup(s)`
        );
    } catch (error: any) {
        console.error("❌ Stuck-quote expiry cron error:", error);
        throw error;
    }
};

export const CronServices = {
    transitionOrdersBasedOnEventDates,
    sendPickupReminders,
    deleteExpiredOTPs,
    transitionSelfPickupReturns,
    expireStuckQuotes,
};
