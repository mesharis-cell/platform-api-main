import { desc, sql } from "drizzle-orm";
import { db } from "../../../db";
import { lineItemRequests } from "../../../db/schema";

const REQUEST_PREFIX = "LIR-";
const MAX_REQUEST_SEQUENCE = 999999;

export const lineItemRequestIdGenerator = async (
    platformId: string,
    executor: any = db
): Promise<string> => {
    await executor.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${platformId} || ':line_item_request'))`
    );

    const lastRequest = await executor
        .select({ line_item_request_id: lineItemRequests.line_item_request_id })
        .from(lineItemRequests)
        .where(
            sql`${lineItemRequests.line_item_request_id} LIKE ${REQUEST_PREFIX + "%"} AND ${lineItemRequests.platform_id} = ${platformId}`
        )
        .orderBy(desc(lineItemRequests.line_item_request_id))
        .limit(1);

    let sequence = 1;
    if (lastRequest.length > 0) {
        const lastId = lastRequest[0].line_item_request_id;
        const lastSequence = parseInt(lastId.replace(REQUEST_PREFIX, ""), 10);
        if (!isNaN(lastSequence)) sequence = lastSequence + 1;
    }

    if (sequence > MAX_REQUEST_SEQUENCE) {
        throw new Error("Line item request id range exhausted for this platform");
    }

    return `${REQUEST_PREFIX}${String(sequence).padStart(6, "0")}`;
};
