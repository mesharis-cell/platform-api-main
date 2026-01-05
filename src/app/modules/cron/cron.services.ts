import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { orders, orderStatusHistory } from "../../../db/schema";
import { getSystemUser } from "../../utils/helper-query";

const transitionOrdersOnEventEnd = async () => {
    try {
        // Step 1: Get today's date (without time component)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split("T")[0];

        // Step 2: Find all orders where status = IN_USE and eventEndDate = today
        const ordersToUpdate = await db.query.orders.findMany({
            where: and(
                eq(orders.order_status, "IN_USE"),
                sql`DATE(${orders.event_end_date}) = ${todayStr}`
            ),
        });

        // Step 3: Early return if no orders to update
        if (ordersToUpdate.length === 0) {
            console.log("✅ Event end cron: No orders to update");
            return;
        }

        // Step 4: Group orders by platform_id to minimize system user queries
        const ordersByPlatform = ordersToUpdate.reduce((acc, order) => {
            if (!acc[order.platform_id]) {
                acc[order.platform_id] = [];
            }
            acc[order.platform_id].push(order);
            return acc;
        }, {} as Record<string, typeof ordersToUpdate>);

        let updatedCount = 0;
        const statusHistoryEntries: Array<{
            platform_id: string;
            order_id: string;
            status: "AWAITING_RETURN";
            notes: string;
            updated_by: string;
        }> = [];

        // Step 5: Process orders grouped by platform
        for (const [platformId, platformOrders] of Object.entries(ordersByPlatform)) {
            // Step 5a: Get system user once per platform
            const systemUser = await getSystemUser(platformId);

            if (!systemUser) {
                console.error(`❌ No system user found for platform ID: ${platformId}. Skipping ${platformOrders.length} orders.`);
                continue;
            }

            // Step 5b: Update all orders for this platform in a single batch
            const orderIds = platformOrders.map(order => order.id);

            await db
                .update(orders)
                .set({
                    order_status: "AWAITING_RETURN",
                    updated_at: new Date(),
                })
                .where(sql`${orders.id} = ANY(${orderIds})`);

            // Step 5c: Prepare status history entries for batch insert
            for (const order of platformOrders) {
                statusHistoryEntries.push({
                    platform_id: order.platform_id,
                    order_id: order.id,
                    status: "AWAITING_RETURN",
                    notes: "Automatic transition on event end date",
                    updated_by: systemUser.id,
                });
            }

            updatedCount += platformOrders.length;
        }

        // Step 6: Batch insert all status history entries
        if (statusHistoryEntries.length > 0) {
            await db.insert(orderStatusHistory).values(statusHistoryEntries);
        }

        // Step 7: Log success
        console.log(
            `✅ Event end cron: Updated ${updatedCount} orders to AWAITING_RETURN`
        );

    } catch (error: any) {
        console.error("❌ Event end cron error:", error);
        throw error;
    }
};

export const CronServices = {
    transitionOrdersOnEventEnd,
};
