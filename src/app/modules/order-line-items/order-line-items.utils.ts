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
// unit_rate, total, sell_unit_rate (the ADMIN-only sell override).
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
    // COMPLIMENTARY lines render with the word "Complimentary" in the price
    // position (never charged). Surface the flag so client surfaces don't have
    // to re-derive it from billing_mode.
    is_complimentary: item.billing_mode === "COMPLIMENTARY",
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
    // total, sell_unit_rate, logistics_visible, client_visible, service_type_id,
    // added_by, voided_by/voided_at/void_reason, editability flags.
});

// CLIENT line-visibility model (owner feedback 2026-07-07, items 2/3/13/14).
// This raw descriptive array is a CLIENT surface (e.g. the portal Quote Summary
// fallback list), so it MUST enforce the same hide rules as the priced
// projection choke point:
//   (a) is_voided        → NEVER renders (bug fix — voided lines were leaking
//                          onto no-cost orders whose empty breakdown fell back
//                          to this raw array);
//   (b) NON_BILLABLE     → NEVER renders to CLIENT (forced internal cost);
//   (c) client_visible=false → the whole-line CLIENT eye is off → hidden.
// COMPLIMENTARY + BILLABLE (client-visible, non-voided) lines survive.
export const projectLineItemsForClient = (items: Array<Record<string, any>>) =>
    items
        .filter(
            (item) =>
                !item.is_voided &&
                item.billing_mode !== "NON_BILLABLE" &&
                item.client_visible !== false
        )
        .map(projectLineItemForClient);

// -------------------------------- LOGISTICS LINE-ITEM PROJECTION --------------------------------
// LOGISTICS is a BUY-only audience: it legitimately sees the buy-side unit_rate
// + total (that IS the warehouse cost it operates on) but must NEVER see the
// ADMIN-only SELL override. sell_unit_rate is the only sell/margin field on a
// raw line_items row (apply_margin + the prices-level margin-override columns
// were retired in migration 0073).
//
// R6+R13 (owner feedback 2026-07-08): logistics must ALSO never see billing-mode
// concepts — a complimentary / non-billable line renders to the warehouse as a
// normal paid line. Strip `billing_mode` (and the derived `is_complimentary`, if
// a caller ever attaches it) alongside the sell override. This is the server-side
// half of defence-in-depth; the warehouse UI drops the tokens/badges separately.
//
// Denylist (not allowlist) so every other buy/display/logistics field the
// warehouse app needs — including the R3 `lir_origin` / `line_item_request_id`
// provenance flags — passes through untouched. Apply this to any LOGISTICS-facing
// response that embeds the raw line_items array (order/inbound detail) or returns
// rows from getLineItems.
export const projectLineItemForLogistics = <T extends Record<string, any>>(item: T) => {
    const {
        sell_unit_rate: _sellUnitRate,
        billing_mode: _billingMode,
        is_complimentary: _isComplimentary,
        ...rest
    } = item;
    void _sellUnitRate;
    void _billingMode;
    void _isComplimentary;
    return rest;
};

export const projectLineItemsForLogistics = (items: Array<Record<string, any>>) =>
    items.map(projectLineItemForLogistics);
