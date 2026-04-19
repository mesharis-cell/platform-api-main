/**
 * Scenario: Order happy path — quote lifecycle (submit → CONFIRMED).
 *
 * Per docs/e2e-testing-system.md §9, the full happy path is:
 *   client submits → logistics prices → admin approves → client approves →
 *   logistics outbound scan → status progression → logistics inbound scan → CLOSED
 *
 * Option C scope (this file, today): steps 1–5 — submit through CONFIRMED.
 * Fulfillment scanning + transitions live in a follow-up scenario; stubs
 * below show the remaining shape for reference.
 *
 * Each implemented step asserts across all four observation surfaces:
 *   HTTP response, DB row state, system_events emission, notification_logs
 *   dispatch per expected recipient.
 *
 * Note on the `x-platform` header: the API's platformValidator expects a
 * UUID, not a domain. The platform UUID is loaded from the seeded platforms
 * row in beforeAll.
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
    assetBookings,
    assetFamilies,
    assets as assetsTable,
    brands,
    cities,
    companies,
    countries,
    lineItems,
    orders,
    platforms,
    serviceTypes,
    users as usersTable,
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

// ─────────────────────────────────────────────────────────────
// Seed refs — queried from DB at suite start so scenarios don't
// hard-code UUIDs across a reseed cycle.
// ─────────────────────────────────────────────────────────────

type SeedRefs = {
    platformId: string;
    companyId: string;
    countryId: string;
    cityId: string;
    brandId: string;
    assetId: string;
    catalogServiceTypeId: string;
    clientUserId: string;
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
        .where(
            and(
                eq(companies.platform_id, platform.id),
                eq(companies.name, TEST_COMPANY_NAME)
            )
        )
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

    // Once the demo seed adds richer catalog (multiple families, mixed
    // conditions, mixed stock modes), arbitrary `.limit(1)` would happily
    // return a SERIALIZED family or a RED-condition asset — neither of which
    // is orderable, breaking step 1. Filter explicitly for a POOLED family
    // and a GREEN, available-quantity-positive, AVAILABLE-status asset.
    const [family] = await db
        .select({ id: assetFamilies.id })
        .from(assetFamilies)
        .where(
            and(
                eq(assetFamilies.company_id, company.id),
                eq(assetFamilies.stock_mode, "POOLED"),
                eq(assetFamilies.is_active, true)
            )
        )
        .limit(1);
    if (!family) throw new Error("Test asset family (POOLED) not found");

    const [asset] = await db
        .select({ id: assetsTable.id })
        .from(assetsTable)
        .where(
            and(
                eq(assetsTable.family_id, family.id),
                eq(assetsTable.condition, "GREEN"),
                eq(assetsTable.status, "AVAILABLE"),
                gt(assetsTable.available_quantity, 0)
            )
        )
        .limit(1);
    if (!asset) throw new Error("Test asset (GREEN + available) not found");

    const [serviceType] = await db
        .select({ id: serviceTypes.id })
        .from(serviceTypes)
        .where(
            and(
                eq(serviceTypes.platform_id, platform.id),
                eq(serviceTypes.category, "ASSEMBLY")
            )
        )
        .limit(1);
    if (!serviceType) throw new Error("Test service type not found");

    const [client] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, CREDS.client.email))
        .limit(1);
    if (!client) throw new Error("Client test user not found");

    return {
        platformId: platform.id,
        companyId: company.id,
        countryId: country.id,
        cityId: city.id,
        brandId: brand.id,
        assetId: asset.id,
        catalogServiceTypeId: serviceType.id,
        clientUserId: client.id,
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
    await suite?.stop();
});

// ─────────────────────────────────────────────────────────────
// Scenario helpers
// ─────────────────────────────────────────────────────────────

const scenarioId = `ohp-${Date.now()}`;
const daysFromNow = (n: number) =>
    new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const buildSubmitPayload = () => ({
    items: [{ asset_id: refs.assetId, quantity: 2 }],
    brand_id: refs.brandId,
    event_start_date: daysFromNow(7),
    event_end_date: daysFromNow(9),
    venue_name: `E2E Venue (${scenarioId})`,
    venue_country_id: refs.countryId,
    venue_city_id: refs.cityId,
    venue_address: "Test venue address, Dubai",
    contact_name: "E2E Client",
    contact_email: CREDS.client.email,
    contact_phone: "+971-50-000-1111",
    special_instructions: `Scenario: ${scenarioId}`,
});

// ─────────────────────────────────────────────────────────────
// Scenario
// ─────────────────────────────────────────────────────────────

describe("Order happy path — quote lifecycle (submit → CONFIRMED)", () => {
    let orderId: string;

    it("Step 1 — client submits order from cart", async () => {
        const res = await actors.client.post<{
            success: boolean;
            data: { order_id: string; status: string };
        }>("/client/v1/order/submit-from-cart", buildSubmitPayload());

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.success).toBe(true);
        const publicOrderId = res.body?.data?.order_id;
        expect(publicOrderId).toBeTruthy();

        // The submit response returns order_id (public human-readable ID like
        // ORD-YYYYMMDD-XXX), not the DB UUID. Look up the UUID by order_id
        // so subsequent steps can reference the row directly.
        const [orderRow] = await db
            .select()
            .from(orders)
            .where(eq(orders.order_id, publicOrderId as string))
            .limit(1);
        expect(orderRow).toBeTruthy();
        orderId = orderRow.id;

        // Surface 2: DB
        expect(["SUBMITTED", "PRICING_REVIEW"]).toContain(orderRow.order_status);

        // Surface 3: system_events
        await expect(orderId).toHaveEmittedEvent("order.submitted");

        // Surface 4: notification_logs — three recipients
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

    it("Step 2 — logistics adds a catalog line item", async () => {
        expect(orderId).toBeTruthy();

        const res = await actors.logistics.post<{
            success: boolean;
            data: { id: string; purpose_type: string; order_id: string; line_item_type: string };
        }>("/operations/v1/line-item/catalog", {
            purpose_type: "ORDER",
            order_id: orderId,
            service_type_id: refs.catalogServiceTypeId,
            quantity: 3,
            billing_mode: "BILLABLE",
            notes: `Added by e2e scenario ${scenarioId}`,
        });

        // Surface 1: HTTP
        expect(res.status).toBe(201);
        expect(res.body?.success).toBe(true);
        expect(res.body?.data?.line_item_type).toBe("CATALOG");

        // Surface 2: DB — line_items row exists for this order
        const lineRows = await db
            .select({ id: lineItems.id, line_item_type: lineItems.line_item_type })
            .from(lineItems)
            .where(
                and(
                    eq(lineItems.order_id, orderId),
                    eq(lineItems.line_item_type, "CATALOG")
                )
            );
        expect(lineRows.length).toBeGreaterThan(0);

        // Surface 3 & 4 — line_item.added is emitted for audit but has no
        // seeded notification rule (see common_gotchas #12 in CLAUDE.md),
        // so no email recipient to assert. We only check the event fired.
        await expect(orderId).toHaveEmittedEvent("line_item.added");
    });

    it("Step 3 — logistics submits order for admin approval → PENDING_APPROVAL", async () => {
        expect(orderId).toBeTruthy();

        const res = await actors.logistics.post<{
            success: boolean;
            data: { order_status: string };
        }>(`/operations/v1/order/${orderId}/submit-for-approval`);

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.data?.order_status).toBe("PENDING_APPROVAL");

        // Surface 2: DB
        await expect(orderId).toHaveOrderStatus("PENDING_APPROVAL");

        // Surface 3: event
        await expect(orderId).toHaveEmittedEvent("order.pending_approval");

        // Surface 4: notification — admin only (per seeded rules)
        await expect(orderId).toHaveDispatchedEmail({
            template: "order_pending_approval_admin",
            to: TEST_INBOX.admin,
        });
    });

    it("Step 4 — admin approves quote → QUOTED (financial: QUOTE_SENT)", async () => {
        expect(orderId).toBeTruthy();

        const res = await actors.admin.post<{
            success: boolean;
            data: { order_status: string; financial_status: string; final_total: string };
        }>(`/operations/v1/order/${orderId}/admin-approve-quote`, {});

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.data?.order_status).toBe("QUOTED");
        // First time through: QUOTE_SENT. Revisions emit QUOTE_REVISED.
        expect(res.body?.data?.financial_status).toBe("QUOTE_SENT");
        expect(Number(res.body?.data?.final_total)).toBeGreaterThan(0);

        // Surface 2: DB
        await expect(orderId).toHaveOrderStatus("QUOTED");
        await expect(orderId).toHaveFinancialStatus("QUOTE_SENT");

        // Surface 3: event
        await expect(orderId).toHaveEmittedEvent("quote.sent");

        // Surface 4: notifications — client + admin (no logistics rule for quote.sent)
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_sent_client",
            to: TEST_INBOX.client,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_sent_admin",
            to: TEST_INBOX.admin,
        });
    });

    it("Step 5 — client approves quote → CONFIRMED + bookings created", async () => {
        expect(orderId).toBeTruthy();

        // Test tenant has require_client_po_number_on_quote_approval=true,
        // so po_number is mandatory here.
        const res = await actors.client.patch<{
            success: boolean;
            data: { order_status: string; financial_status: string; po_number: string };
        }>(`/client/v1/order/${orderId}/approve-quote`, {
            po_number: `PO-${scenarioId}`,
            notes: "Approved by E2E scenario",
        });

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.data?.order_status).toBe("CONFIRMED");
        expect(res.body?.data?.financial_status).toBe("QUOTE_ACCEPTED");

        // Surface 2: DB — order + bookings
        await expect(orderId).toHaveOrderStatus("CONFIRMED");
        await expect(orderId).toHaveFinancialStatus("QUOTE_ACCEPTED");

        const bookings = await db
            .select({ id: assetBookings.id, asset_id: assetBookings.asset_id })
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderId));
        expect(bookings.length).toBeGreaterThan(0);

        // Surface 3: event
        await expect(orderId).toHaveEmittedEvent("quote.approved");

        // Surface 4: notifications — admin + logistics (no client rule for quote.approved)
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_approved_admin",
            to: TEST_INBOX.admin,
        });
        await expect(orderId).toHaveDispatchedEmail({
            template: "quote_approved_logistics",
            to: TEST_INBOX.logistics,
        });
    });
});

// ─────────────────────────────────────────────────────────────
// Fulfillment phase — phase 2 of this scenario. See §10 Phase 2
// in docs/e2e-testing-system.md. Each step follows the same four-
// surface assertion pattern as the quote-lifecycle steps above.
// ─────────────────────────────────────────────────────────────

describe.skip("Order happy path — fulfillment (CONFIRMED → CLOSED) [phase 2]", () => {
    // - PATCH /operations/v1/order/:id/status with new_status="IN_PREPARATION"
    //   → order.confirmed event → client + admin + logistics notifications
    it.skip("CONFIRMED → IN_PREPARATION", () => {});

    // - POST /operations/v1/scanning/outbound/:order_id/scan (loop)
    // - POST /operations/v1/scanning/outbound/:order_id/truck-photos
    // - POST /operations/v1/scanning/outbound/:order_id/complete
    //   → READY_FOR_DELIVERY + order.ready_for_delivery event + admin notification
    it.skip("outbound scan → READY_FOR_DELIVERY", () => {});

    // - PATCH status: IN_TRANSIT → order.in_transit event + client + admin notifications
    // - PATCH status: DELIVERED → order.delivered event + client + admin + logistics notifications
    it.skip("progress → IN_TRANSIT → DELIVERED", () => {});

    // - PATCH status: IN_USE / DERIG / AWAITING_RETURN (no events in current code)
    // - POST /operations/v1/scanning/inbound/:order_id/scan (loop with condition)
    // - POST /operations/v1/scanning/inbound/:order_id/complete
    //   → CLOSED + order.closed event + admin notification + bookings released
    it.skip("inbound scan → CLOSED", () => {});
});
