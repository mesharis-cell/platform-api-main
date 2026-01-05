import { eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { orderStatusHistory, users } from "../../../db/schema";

/**
 * Get or create a system user for automated operations
 * This user is used for cron jobs and other automated tasks
 * @param platformId - The platform ID
 * @returns The system user ID
 */
export const getSystemUserId = async (platformId: string): Promise<string> => {
    const systemEmail = "system@system.internal";

    // Try to find existing system user
    const [existingUser] = await db
        .select()
        .from(users)
        .where(
            sql`${users.email} = ${systemEmail} AND ${users.platform_id} = ${platformId}`
        )
        .limit(1);

    if (existingUser) {
        return existingUser.id;
    }

    // Create system user if it doesn't exist
    const [newUser] = await db
        .insert(users)
        .values({
            platform_id: platformId,
            company_id: null, // System user doesn't belong to any company
            name: "System",
            email: systemEmail,
            password: "N/A", // System user doesn't need a password
            role: "ADMIN",
            permissions: [],
            permission_template: "PLATFORM_ADMIN",
            is_active: true,
        })
        .returning();

    return newUser.id;
};

/**
 * Create a status history entry for an order
 * @param orderId - The order ID
 * @param status - The new status
 * @param userId - The user ID who made the change
 * @param notes - Optional notes about the status change
 * @param platformId - The platform ID
 */
export const createStatusHistoryEntry = async (
    orderId: string,
    status: string,
    userId: string,
    notes: string | null,
    platformId: string
): Promise<void> => {
    await db.insert(orderStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: status as any,
        notes: notes,
        updated_by: userId,
    });
};
