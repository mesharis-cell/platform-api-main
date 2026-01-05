import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { orders } from "../../../db/schema";
import { createStatusHistoryEntry, getSystemUserId } from "./cron.utils";

const transitionOrdersOnEventEnd = async () => {
    try {
        // Get today's date (without time component)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split("T")[0];

        // Find orders where status = IN_USE and eventEndDate = today
        const ordersToUpdate = await db.query.orders.findMany({
            where: and(
                eq(orders.order_status, "IN_USE"),
                sql`DATE(${orders.event_end_date}) = ${todayStr}`
            ),
        });

        let updatedCount = 0;

        for (const order of ordersToUpdate) {
            // Get system user ID for this platform
            const systemUserId = await getSystemUserId(order.platform_id);

            // Update status to AWAITING_RETURN
            await db
                .update(orders)
                .set({
                    order_status: "AWAITING_RETURN",
                    updated_at: new Date(),
                })
                .where(eq(orders.id, order.id));

            // Create status history entry
            await createStatusHistoryEntry(
                order.id,
                "AWAITING_RETURN",
                systemUserId,
                "Automatic transition on event end date",
                order.platform_id
            );

            updatedCount++;
        }

        console.log(
            `✅ Event end cron: Updated ${updatedCount} orders to AWAITING_RETURN`
        );

        return {
            success: true,
            updatedCount,
            message: `Transitioned ${updatedCount} orders to AWAITING_RETURN`,
        };
    } catch (error: any) {
        console.error("❌ Event end cron error:", error);
        throw error;
    }
};

export const CronServices = {
    transitionOrdersOnEventEnd,
};
