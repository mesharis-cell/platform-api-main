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

// -------------------------------- CLIENT LINE-ITEM PROJECTION --------------------------------
// Raw line_items rows (from getLineItems / SELECT *) carry BUY-side pricing:
// unit_rate, total, sell_unit_rate (the ADMIN-only sell override), apply_margin.
// Those must NEVER reach a CLIENT. Any CLIENT-facing detail response that
// embeds the raw line_items array (order + inbound request) has to project it
// through this SELL-ONLY allowlist first.
//
// Allowlist (not denylist) on purpose: a future column added to line_items is
// dropped by default rather than silently leaked. Client-facing SELL numbers
// live on the role-projected pricing breakdown (order_pricing / request_pricing
// breakdown_lines), NOT on this raw array — so the raw row contributes only its
// descriptive + visibility fields here.
export const projectLineItemForClient = (item: Record<string, any>) => ({
    id: item.id,
    line_item_id: item.line_item_id,
    order_id: item.order_id ?? null,
    inbound_request_id: item.inbound_request_id ?? null,
    service_request_id: item.service_request_id ?? null,
    self_pickup_id: item.self_pickup_id ?? null,
    purpose_type: item.purpose_type,
    line_item_type: item.line_item_type,
    system_key: item.system_key ?? null,
    billing_mode: item.billing_mode,
    category: item.category,
    description: item.description,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    notes: item.notes ?? null,
    metadata: item.metadata ?? {},
    client_price_visible: item.client_price_visible,
    is_voided: item.is_voided,
    created_at: item.created_at,
    updated_at: item.updated_at,
    added_at: item.added_at,
    // Intentionally OMITTED (buy-side / margin / sell override): unit_rate,
    // total, sell_unit_rate, apply_margin, logistics_visible, service_type_id,
    // added_by, voided_by/voided_at/void_reason, editability flags.
});

export const projectLineItemsForClient = (items: Array<Record<string, any>>) =>
    items.map(projectLineItemForClient);
