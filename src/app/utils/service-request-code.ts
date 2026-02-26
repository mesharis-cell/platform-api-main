import { and, count, eq, ilike } from "drizzle-orm";
import { db } from "../../db";
import { serviceRequests } from "../../db/schema";

/**
 * Generates N unique service request codes in the format SR-YYYYMMDD-NNNN.
 * Queries the DB once and returns sequential codes for the entire batch.
 */
export const buildServiceRequestCodes = async (
    platformId: string,
    quantity: number = 1
): Promise<string[]> => {
    const now = new Date();
    const dateCode = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const prefix = `SR-${dateCode}-`;

    const [row] = await db
        .select({ count: count() })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.platform_id, platformId),
                ilike(serviceRequests.service_request_id, `${prefix}%`)
            )
        );

    const start = Number(row?.count || 0) + 1;
    return Array.from(
        { length: quantity },
        (_, i) => `${prefix}${String(start + i).padStart(4, "0")}`
    );
};

/** Convenience wrapper when only one code is needed. */
export const buildServiceRequestCode = async (platformId: string): Promise<string> => {
    const [code] = await buildServiceRequestCodes(platformId, 1);
    return code;
};
