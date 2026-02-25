import { and, count, eq, gte, lt } from "drizzle-orm";
import { db } from "../../db";
import { serviceRequests } from "../../db/schema";

/**
 * Generates a unique service request code in the format SR-YYYYMMDD-NNNN.
 * Must be called outside of a transaction — Postgres READ COMMITTED isolation means
 * in-transaction inserts are not visible to COUNT queries in the same transaction,
 * which would produce duplicate codes for multi-item batches.
 */
export const buildServiceRequestCode = async (platformId: string): Promise<string> => {
    const now = new Date();
    const dateCode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [row] = await db
        .select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.platform_id, platformId),
                gte(serviceRequests.created_at, start),
                lt(serviceRequests.created_at, end)
            )
        );

    const sequence = String(Number(row?.count || 0) + 1).padStart(4, "0");
    return `SR-${dateCode}-${sequence}`;
};
