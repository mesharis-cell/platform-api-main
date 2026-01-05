import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import { orders, orderStatusHistory } from "../../../db/schema";
import { getSystemUser } from "../../utils/helper-query";

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
            ...ordersForEventStart.map(order => ({ order, newStatus: "IN_USE" as const, reason: "event start" })),
            ...ordersForEventEnd.map(order => ({ order, newStatus: "AWAITING_RETURN" as const, reason: "event end" })),
        ];

        const ordersByPlatform = allOrdersWithTransition.reduce((acc, { order, newStatus, reason }) => {
            if (!acc[order.platform_id]) {
                acc[order.platform_id] = [];
            }
            acc[order.platform_id].push({ order, newStatus, reason });
            return acc;
        }, {} as Record<string, Array<{ order: typeof ordersForEventStart[0]; newStatus: "IN_USE" | "AWAITING_RETURN"; reason: string }>>);

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
                console.error(`❌ No system user found for platform ID: ${platformId}. Skipping ${platformOrdersWithTransition.length} orders.`);
                continue;
            }

            // Step 5b: Group by status transition for batch updates
            const ordersByStatus = platformOrdersWithTransition.reduce((acc, item) => {
                if (!acc[item.newStatus]) {
                    acc[item.newStatus] = [];
                }
                acc[item.newStatus].push(item);
                return acc;
            }, {} as Record<string, typeof platformOrdersWithTransition>);

            // Step 5c: Batch update orders for each status
            for (const [newStatus, items] of Object.entries(ordersByStatus)) {
                const orderIds = items.map(item => item.order.id);

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

export const CronServices = {
    transitionOrdersBasedOnEventDates,
};
