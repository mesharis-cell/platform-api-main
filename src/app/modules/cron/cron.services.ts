import { and, eq, lt, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import { orders, orderStatusHistory, otp, systemEvents } from "../../../db/schema";
import { getSystemUser } from "../../utils/helper-query";
import { eventBus, EVENT_TYPES } from "../../events";
import config from "../../config";

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
                            order_url: `${config.client_url}/orders/${order.order_id}`,
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

export const CronServices = {
    transitionOrdersBasedOnEventDates,
    sendPickupReminders,
    deleteExpiredOTPs,
};
