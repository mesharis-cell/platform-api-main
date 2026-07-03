/**
 * Scenario: Order email lifecycle — fire EVERY standardized order email.
 *
 * PURPOSE IS MANUAL REVIEW, not correctness assertion. This scenario drives
 * orders through every transition that emits a notification, so a human can
 * eyeball the rendered emails in the e2e Outlook inboxes (they forward to the
 * operator) or the Resend dashboard. The notification worker sends real mail
 * during the run and the suite drains the queue at teardown, so a full run
 * lands the whole standardized set in the inbox.
 *
 * What we're reviewing: the canonical order-info block (order_info builder +
 * orderInfoRows partial — see src/app/utils/order-email-info.ts). Every order
 * emit site now carries order_info, so every email below renders the SAME
 * block. Money rows use the platform currency (formatMoney + resolvePlatformCurrency).
 *
 * Coverage — one describe per branch. Branches are mutually exclusive on a
 * single order (approve vs decline vs cancel; cancel only before READY), so we
 * use several throwaway orders:
 *   A. Forward lifecycle (GREEN pooled asset): submit → pending_approval →
 *      quote.sent → (line-item edit → order.updated re-review → re-approve →
 *      quote.revised) → time_windows_updated → client approve (quote.approved
 *      + order.confirmed) → IN_PREPARATION → outbound scan → ready_for_delivery
 *      → in_transit → delivered → [past-date patch] → IN_USE → DERIG →
 *      AWAITING_RETURN → inbound scan → closed.
 *   B. Decline: submit → quote.sent → client declines → quote.declined.
 *   C. Cancel: submit → admin cancels → order.cancelled.
 *   D. Maintenance-decision change (ORANGE asset): submit (USE_AS_IS) → client
 *      requests FIX_IN_ORDER → maintenance_decision_change_requested. Cancels
 *      at the end to free the single ORANGE unit for branch E.
 *   E. Repair-before-event (ORANGE asset, FIX_IN_ORDER at submit) →
 *      repair_before_event_required.
 *
 * The DELIVERED→IN_USE and IN_USE→AWAITING_RETURN transitions gate on the event
 * being in the past, but submit-feasibility requires a future event. We bridge
 * that wall-clock gap by patching the order's event dates into the past directly
 * in the DB after DELIVERED — a test-only shortcut; it doesn't change what the
 * emails render (order_info just shows the patched dates).
 *
 * Assertions are a light safety net (did the email queue?). A failing assert
 * does NOT stop the send — the email already fired by then. Run alone:
 *   APP_ENV=testing bun test --preload ./test/setup/preload.ts \
 *     test/scenarios/order-email-lifecycle.test.ts
 * (Needs a seeded test DB — run `bun run db:seed:test` first.)
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq, gt } from "drizzle-orm";
import {
    bootstrapSuite,
    truncateBusinessData,
    verifySchema,
    type SuiteHandle,
} from "../setup/lifecycle";
import { createActors, createClient, type Actors } from "../support/http";
import { db } from "../support/db";
import {
    assets as assetsTable,
    brands,
    cities,
    companies,
    countries,
    legacyAssetFamilies,
    orderItems,
    orders,
    platforms,
    serviceTypes,
} from "../../src/db/schema";
import { TEST_COMPANY_NAME, TEST_INBOX, TEST_PLATFORM_DOMAIN } from "../support/constants";

// ─────────────────────────────────────────────────────────────
// Credentials — must match seed-test.ts exactly.
// ─────────────────────────────────────────────────────────────

const CREDS = {
    admin: { email: TEST_INBOX.admin, password: "E2ePass!Admin1" },
    logistics: { email: TEST_INBOX.logistics, password: "E2ePass!Logi1" },
    client: { email: TEST_INBOX.client, password: "E2ePass!Client1" },
};

// ORANGE demo asset (condition=ORANGE, refurb_days_estimate=2, qty 1) — used
// by the maintenance + repair branches. Seeded in src/db/seeds/demo-catalog.ts.
const ORANGE_QR = "DEMO-BACKDROP-003";

// ─────────────────────────────────────────────────────────────
// Seed refs
// ─────────────────────────────────────────────────────────────

type SeedRefs = {
    platformId: string;
    companyId: string;
    countryId: string;
    cityId: string;
    brandId: string;
    greenAssetId: string;
    greenAssetQr: string;
    orangeAssetId: string;
    catalogServiceTypeId: string;
};

const loadSeedRefs = async (): Promise<SeedRefs> => {
    const [platform] = await db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.domain, TEST_PLATFORM_DOMAIN))
        .limit(1);
    if (!platform) {
        throw new Error(
            `Test platform "${TEST_PLATFORM_DOMAIN}" not found. Did you run \`bun run db:seed:test\`?`
        );
    }

    const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.platform_id, platform.id), eq(companies.name, TEST_COMPANY_NAME)))
        .limit(1);
    if (!company) throw new Error(`Test company "${TEST_COMPANY_NAME}" not found.`);

    const [country] = await db
        .select({ id: countries.id })
        .from(countries)
        .where(eq(countries.platform_id, platform.id))
        .limit(1);
    if (!country) throw new Error("Test country not found");

    const [city] = await db
        .select({ id: cities.id })
        .from(cities)
        .where(eq(cities.platform_id, platform.id))
        .limit(1);
    if (!city) throw new Error("Test city not found");

    const [brand] = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.company_id, company.id))
        .limit(1);
    if (!brand) throw new Error("Test brand not found");

    // GREEN + AVAILABLE + POOLED asset for the fulfillable forward lifecycle.
    const [family] = await db
        .select({ id: legacyAssetFamilies.id })
        .from(legacyAssetFamilies)
        .where(
            and(
                eq(legacyAssetFamilies.company_id, company.id),
                eq(legacyAssetFamilies.stock_mode, "POOLED"),
                eq(legacyAssetFamilies.is_active, true)
            )
        )
        .limit(1);
    if (!family) throw new Error("Test asset family (POOLED) not found");

    const [green] = await db
        .select({ id: assetsTable.id, qr_code: assetsTable.qr_code })
        .from(assetsTable)
        .where(
            and(
                eq(assetsTable.group_id, family.id),
                eq(assetsTable.condition, "GREEN"),
                eq(assetsTable.status, "AVAILABLE"),
                gt(assetsTable.available_quantity, 0)
            )
        )
        .limit(1);
    if (!green) throw new Error("Test asset (GREEN + available) not found");

    // ORANGE asset — condition-flagged, orderable (available_quantity 1).
    const [orange] = await db
        .select({ id: assetsTable.id })
        .from(assetsTable)
        .where(and(eq(assetsTable.platform_id, platform.id), eq(assetsTable.qr_code, ORANGE_QR)))
        .limit(1);
    if (!orange)
        throw new Error(`ORANGE demo asset (${ORANGE_QR}) not found — check demo-catalog seed.`);

    const [serviceType] = await db
        .select({ id: serviceTypes.id })
        .from(serviceTypes)
        .where(
            and(eq(serviceTypes.platform_id, platform.id), eq(serviceTypes.category, "ASSEMBLY"))
        )
        .limit(1);
    if (!serviceType) throw new Error("Test service type not found");

    return {
        platformId: platform.id,
        companyId: company.id,
        countryId: country.id,
        cityId: city.id,
        brandId: brand.id,
        greenAssetId: green.id,
        greenAssetQr: green.qr_code,
        orangeAssetId: orange.id,
        catalogServiceTypeId: serviceType.id,
    };
};

// ─────────────────────────────────────────────────────────────
// Suite lifecycle
// ─────────────────────────────────────────────────────────────

let suite: SuiteHandle;
let actors: Actors;
let refs: SeedRefs;

beforeAll(async () => {
    await verifySchema();
    await truncateBusinessData();

    refs = await loadSeedRefs();
    suite = await bootstrapSuite();

    const httpClient = createClient(suite.baseUrl, { platformId: refs.platformId });
    actors = await createActors(httpClient, CREDS);
});

afterAll(async () => {
    // stop() drains the notification queue — this is where the real emails go out.
    await suite?.stop();
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const scenarioId = `oel-${Date.now()}`;
const daysFromNow = (n: number) =>
    new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const isoFromNow = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
};

type SubmitOpts = {
    assetId: string;
    quantity: number;
    maintenanceDecision?: "USE_AS_IS" | "FIX_IN_ORDER";
    label: string;
};

const buildSubmitPayload = (o: SubmitOpts) => ({
    items: [
        {
            asset_id: o.assetId,
            quantity: o.quantity,
            ...(o.maintenanceDecision ? { maintenance_decision: o.maintenanceDecision } : {}),
        },
    ],
    brand_id: refs.brandId,
    event_start_date: daysFromNow(7),
    event_end_date: daysFromNow(9),
    venue_name: `E2E Venue — ${o.label} (${scenarioId})`,
    venue_country_id: refs.countryId,
    venue_city_id: refs.cityId,
    venue_address: "Test venue address, Dubai",
    venue_access_notes: "Loading bay at rear; ask for site manager.",
    contact_name: "E2E Client",
    contact_email: CREDS.client.email,
    contact_phone: "+971-50-000-1111",
    special_instructions: `Scenario: ${scenarioId} — ${o.label}`,
});

// Submit an order and return its DB uuid.
const submitOrder = async (o: SubmitOpts): Promise<string> => {
    const res = await actors.client.post<{
        success: boolean;
        data: { order_id: string };
    }>("/client/v1/order/submit-from-cart", buildSubmitPayload(o));
    expect(res).toBeOk();
    const publicId = res.body?.data?.order_id;
    expect(publicId).toBeTruthy();
    const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.order_id, publicId as string))
        .limit(1);
    expect(row).toBeTruthy();
    return row.id;
};

// Drive an order submit → PENDING_APPROVAL → admin approve (→ QUOTED, quote.sent).
// Returns the added line item id (used by the revision step).
const driveToQuoted = async (orderId: string): Promise<string> => {
    const lineRes = await actors.logistics.post<{ success: boolean; data: { id: string } }>(
        "/operations/v1/line-item/catalog",
        {
            purpose_type: "ORDER",
            order_id: orderId,
            service_type_id: refs.catalogServiceTypeId,
            quantity: 3,
            billing_mode: "BILLABLE",
            notes: `e2e ${scenarioId}`,
        }
    );
    expect(lineRes.status).toBe(201);

    const approvalRes = await actors.logistics.post(
        `/operations/v1/order/${orderId}/submit-for-approval`
    );
    expect(approvalRes).toBeOk();

    const quoteRes = await actors.admin.post(
        `/operations/v1/order/${orderId}/admin-approve-quote`,
        {}
    );
    expect(quoteRes).toBeOk();

    return lineRes.body?.data?.id as string;
};

// ─────────────────────────────────────────────────────────────
// A. Forward lifecycle — submit → CLOSED
// ─────────────────────────────────────────────────────────────

describe("A. Forward lifecycle — submit → CLOSED (fires the full happy chain)", () => {
    let orderId: string;
    let lineItemId: string;

    it("submit → order.submitted (client + admin + logistics)", async () => {
        orderId = await submitOrder({ assetId: refs.greenAssetId, quantity: 2, label: "forward" });
        await expect(orderId).toHaveEmittedEvent("order.submitted");
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_submitted_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_submitted_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_submitted_logistics",
            to: TEST_INBOX.logistics,
        });
    });

    it("logistics prices + admin approves → order.pending_approval + quote.sent", async () => {
        lineItemId = await driveToQuoted(orderId);
        await expect(orderId).toHaveOrderStatus("QUOTED");
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_pending_approval_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_sent_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_sent_admin",
            to: TEST_INBOX.admin,
        });
    });

    it("post-quote line-item edit reverts to re-review → order.updated (admin + logistics)", async () => {
        const res = await actors.logistics.put(`/operations/v1/line-item/${lineItemId}`, {
            quantity: 4,
        });
        expect(res).toBeOk();
        await expect(orderId).toHaveOrderStatus("PENDING_APPROVAL");
        await expect(orderId).toHaveEmittedEvent("order.updated");
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_updated_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_updated_admin",
            to: TEST_INBOX.logistics,
        });
    });

    it("admin re-approves the revised quote → quote.revised (client + admin)", async () => {
        const res = await actors.admin.post(
            `/operations/v1/order/${orderId}/admin-approve-quote`,
            {}
        );
        expect(res).toBeOk();
        await expect(orderId).toHaveOrderStatus("QUOTED");
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_revised_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_revised_admin",
            to: TEST_INBOX.admin,
        });
    });

    it("logistics sets delivery/pickup windows → order.time_windows_updated (client + admin)", async () => {
        const res = await actors.logistics.patch(`/operations/v1/order/${orderId}/time-windows`, {
            delivery_window_start: isoFromNow(6, 8),
            delivery_window_end: isoFromNow(6, 12),
            pickup_window_start: isoFromNow(10, 8),
            pickup_window_end: isoFromNow(10, 12),
        });
        expect(res).toBeOk();
        await expect(orderId).toHaveDispatchedEmail({
            template: "time_windows_updated_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "time_windows_updated_admin",
            to: TEST_INBOX.admin,
        });
    });

    it("client approves quote → quote.approved + order.confirmed (all recipients)", async () => {
        const res = await actors.client.patch(`/client/v1/order/${orderId}/approve-quote`, {
            po_number: `PO-${scenarioId}`,
            notes: "Approved by E2E email-lifecycle scenario",
        });
        expect(res).toBeOk();
        await expect(orderId).toHaveOrderStatus("CONFIRMED");
        // quote.approved → admin + logistics
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_approved_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_approved_logistics",
            to: TEST_INBOX.logistics,
        });
        // order.confirmed → client + admin + logistics
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_confirmed_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_confirmed_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_confirmed_logistics",
            to: TEST_INBOX.logistics,
        });
    });

    it("logistics preps + outbound scan → order.ready_for_delivery (admin)", async () => {
        const prep = await actors.logistics.patch(`/operations/v1/order/${orderId}/status`, {
            new_status: "IN_PREPARATION",
        });
        expect(prep).toBeOk();

        const scan = await actors.logistics.post(
            `/operations/v1/scanning/outbound/${orderId}/scan`,
            { qr_code: refs.greenAssetQr, quantity: 2, note: `e2e ${scenarioId}` }
        );
        expect(scan).toBeOk();

        const complete = await actors.logistics.post(
            `/operations/v1/scanning/outbound/${orderId}/complete`
        );
        expect(complete).toBeOk();

        await expect(orderId).toHaveOrderStatus("READY_FOR_DELIVERY");
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_ready_admin",
            to: TEST_INBOX.admin,
        });
    });

    it("dispatch → order.in_transit (client + admin)", async () => {
        const res = await actors.logistics.patch(`/operations/v1/order/${orderId}/status`, {
            new_status: "IN_TRANSIT",
        });
        expect(res).toBeOk();
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_in_transit_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_in_transit_admin",
            to: TEST_INBOX.admin,
        });
    });

    it("deliver → order.delivered (client + admin + logistics)", async () => {
        const res = await actors.logistics.patch(`/operations/v1/order/${orderId}/status`, {
            new_status: "DELIVERED",
        });
        expect(res).toBeOk();
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_delivered_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_delivered_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_delivered_logistics",
            to: TEST_INBOX.logistics,
        });
    });

    it("event completes + inbound scan → order.closed (admin)", async () => {
        // Test-only shortcut: the event is 7 days out but DELIVERED→IN_USE and
        // IN_USE→AWAITING_RETURN gate on the event being in the past. Patch the
        // dates back so the fulfillment tail can proceed within one test run.
        await db
            .update(orders)
            .set({
                event_start_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                event_end_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            })
            .where(eq(orders.id, orderId));

        for (const next of ["IN_USE", "DERIG", "AWAITING_RETURN"]) {
            const step = await actors.logistics.patch(`/operations/v1/order/${orderId}/status`, {
                new_status: next,
            });
            expect(step).toBeOk();
        }

        const scan = await actors.logistics.post(
            `/operations/v1/scanning/inbound/${orderId}/scan`,
            {
                qr_code: refs.greenAssetQr,
                condition: "GREEN",
                quantity: 2,
                return_media: [
                    { url: "https://example.com/e2e/return-1.jpg", note: "e2e" },
                    { url: "https://example.com/e2e/return-2.jpg", note: "e2e" },
                ],
            }
        );
        expect(scan).toBeOk();

        const complete = await actors.logistics.post(
            `/operations/v1/scanning/inbound/${orderId}/complete`,
            {}
        );
        expect(complete).toBeOk();

        await expect(orderId).toHaveOrderStatus("CLOSED");
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_closed_admin",
            to: TEST_INBOX.admin,
        });
    });
});

// ─────────────────────────────────────────────────────────────
// B. Decline branch
// ─────────────────────────────────────────────────────────────

describe("B. Decline branch — client declines the quote", () => {
    it("submit → quote → client declines → quote.declined (admin + logistics)", async () => {
        const orderId = await submitOrder({
            assetId: refs.greenAssetId,
            quantity: 1,
            label: "decline",
        });
        await driveToQuoted(orderId);

        const res = await actors.client.patch(`/client/v1/order/${orderId}/decline-quote`, {
            decline_reason: "Budget not approved this quarter — declining for E2E review.",
        });
        expect(res).toBeOk();
        await expect(orderId).toHaveOrderStatus("DECLINED");
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_declined_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_declined_logistics",
            to: TEST_INBOX.logistics,
        });
    });
});

// ─────────────────────────────────────────────────────────────
// C. Cancel branch
// ─────────────────────────────────────────────────────────────

describe("C. Cancel branch — admin cancels a submitted order", () => {
    it("submit → admin cancels → order.cancelled (client + admin + logistics)", async () => {
        const orderId = await submitOrder({
            assetId: refs.greenAssetId,
            quantity: 1,
            label: "cancel",
        });

        const res = await actors.admin.post(`/operations/v1/order/${orderId}/cancel`, {
            reason: "client_requested",
            notes: "Cancelled per client request — E2E review of the cancellation email.",
            notify_client: true,
        });
        expect(res).toBeOk();
        await expect(orderId).toHaveOrderStatus("CANCELLED");
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_cancelled_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_cancelled_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_cancelled_logistics",
            to: TEST_INBOX.logistics,
        });
    });
});

// ─────────────────────────────────────────────────────────────
// D. Maintenance-decision change (ORANGE asset)
// ─────────────────────────────────────────────────────────────

describe("D. Maintenance-decision change — client requests FIX_IN_ORDER (ORANGE asset)", () => {
    it("submit (USE_AS_IS) → decision-change request → maintenance_decision_change_requested (admin)", async () => {
        const orderId = await submitOrder({
            assetId: refs.orangeAssetId,
            quantity: 1,
            maintenanceDecision: "USE_AS_IS",
            label: "maint-decision",
        });

        const [item] = await db
            .select({ id: orderItems.id })
            .from(orderItems)
            .where(
                and(eq(orderItems.order_id, orderId), eq(orderItems.asset_id, refs.orangeAssetId))
            )
            .limit(1);
        expect(item).toBeTruthy();

        const res = await actors.client.post(
            `/client/v1/order/${orderId}/maintenance-decision-change-requests`,
            { order_item_id: item.id, requested_decision: "FIX_IN_ORDER" }
        );
        expect(res).toBeOk();
        await expect(orderId).toHaveEmittedEvent("order.maintenance_decision_change_requested");
        await expect(orderId).toHaveDispatchedEmail({
            template: "maintenance_decision_change_requested_admin",
            to: TEST_INBOX.admin,
        });

        // Free the single ORANGE unit for branch E.
        const cancel = await actors.admin.post(`/operations/v1/order/${orderId}/cancel`, {
            reason: "other",
            notes: "Releasing the ORANGE unit for the repair-before-event branch (E2E).",
            notify_client: false,
        });
        expect(cancel).toBeOk();
    });
});

// ─────────────────────────────────────────────────────────────
// E. Repair-before-event (ORANGE asset, FIX_IN_ORDER at submit)
// ─────────────────────────────────────────────────────────────

describe("E. Repair-before-event — submit ORANGE with FIX_IN_ORDER", () => {
    it("submit (FIX_IN_ORDER) → repair_before_event_required (admin + logistics)", async () => {
        const orderId = await submitOrder({
            assetId: refs.orangeAssetId,
            quantity: 1,
            maintenanceDecision: "FIX_IN_ORDER",
            label: "repair",
        });
        await expect(orderId).toHaveEmittedEvent("order.repair_before_event_required");
        await expect(orderId).toHaveDispatchedEmail({
            template: "repair_before_event_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "repair_before_event_logistics",
            to: TEST_INBOX.logistics,
        });
    });
});
