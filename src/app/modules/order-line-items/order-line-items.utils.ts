import { desc, sql } from "drizzle-orm";
import { db } from "../../../db";
import { invoiceTypeEnum, lineItems } from "../../../db/schema";

// ------------------------------------- LINE ITEM ID GENERATOR --------------------------------
// FORMAT: K-XXXXXX (6 digits)
const LINE_ITEM_PREFIX = "K-";
const MAX_LINE_ITEM_SEQUENCE = 999999;

export const lineItemIdGenerator = async (
    platformId: string,
    executor: any = db
): Promise<string> => {
    // Transaction-scoped lock serializes allocation per platform when called inside tx.
    await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${platformId}))`);

    const lastLineItem = await executor
        .select({ line_item_id: lineItems.line_item_id })
        .from(lineItems)
        .where(
            sql`${lineItems.line_item_id} LIKE ${LINE_ITEM_PREFIX + "%"} AND ${lineItems.platform_id} = ${platformId}`
        )
        .orderBy(desc(lineItems.line_item_id))
        .limit(1);

    let sequence = 1;
    if (lastLineItem.length > 0) {
        const lastId = lastLineItem[0].line_item_id;
        const lastSequence = parseInt(lastId.replace(LINE_ITEM_PREFIX, ""), 10);
        if (!isNaN(lastSequence)) {
            sequence = lastSequence + 1;
        }
    }

    if (sequence > MAX_LINE_ITEM_SEQUENCE) {
        throw new Error("K-number range exhausted for this platform");
    }

    const sequenceStr = sequence.toString().padStart(6, "0");
    return `${LINE_ITEM_PREFIX}${sequenceStr}`;
};

export const lineItemQueryValidationConfig = {
    purpose_type: invoiceTypeEnum.enumValues,
};
