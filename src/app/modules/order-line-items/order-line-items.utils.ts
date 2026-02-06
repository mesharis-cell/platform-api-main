import { desc, sql } from "drizzle-orm";
import { db } from "../../../db";
import { invoiceTypeEnum, lineItems } from "../../../db/schema";

// ------------------------------------- LINE ITEM ID GENERATOR --------------------------------
// FORMAT: K-XXXXXX (6 digits)
export const lineItemIdGenerator = async (platformId: string): Promise<string> => {
    const prefix = "K-";

    // Find highest sequence number for this platform
    const lastLineItem = await db
        .select({ line_item_id: lineItems.line_item_id })
        .from(lineItems)
        .where(sql`${lineItems.line_item_id} LIKE ${prefix + "%"} AND ${lineItems.platform_id} = ${platformId}`)
        .orderBy(desc(lineItems.line_item_id))
        .limit(1);

    let sequence = 1;
    if (lastLineItem.length > 0) {
        const lastId = lastLineItem[0].line_item_id;
        const lastSequence = parseInt(lastId.replace(prefix, ""), 10);
        if (!isNaN(lastSequence)) {
            sequence = lastSequence + 1;
        }
    }

    const sequenceStr = sequence.toString().padStart(6, "0");
    return `${prefix}${sequenceStr}`;
};

export const lineItemQueryValidationConfig = {
    purpose_type: invoiceTypeEnum.enumValues,
}