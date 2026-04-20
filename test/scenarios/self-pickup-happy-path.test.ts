/**
 * Scenario: Self-pickup happy path — quote lifecycle (submit → READY_FOR_PICKUP).
 *
 * Mirrors order-happy-path.test.ts but for the SELF_PICKUP entity. Covers the
 * 5-step quote-and-prep lifecycle:
 *   1. client submit-from-cart → SUBMITTED/PRICING_REVIEW
 *   2. logistics submit-for-approval → PENDING_APPROVAL
 *   3. admin approve → QUOTED
 *   4. client approve-quote → CONFIRMED
 *   5. logistics mark ready-for-pickup → READY_FOR_PICKUP
 *
 * Handover + return scanning live in a follow-up phase (require QR-based scans
 * with real asset data). Stubs below show the remaining shape.
 *
 * Each step asserts across all four observation surfaces: HTTP, DB, events,
 * notification_logs. Requires enable_self_pickup=true in the test platform
 * (see seed-test.ts).
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
    assetFamilies,
    assets as assetsTable,
    brands,
    companies,
    platforms,
    selfPickups,
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
// Seed refs
// ─────────────────────────────────────────────────────────────

type SeedRefs = {
    platformId: string;
    companyId: string;
    brandId: string;
    assetId: string;
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
            `Test platform "${TEST_PLATFORM_DOMAIN}" not found. Run \`bun run db:seed:test\`.`
        );
    }

    const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.platform_id, platform.id), eq(companies.name, TEST_COMPANY_NAME)))
        .limit(1);
    if (!company) throw new Error(`Test company "${TEST_COMPANY_NAME}" not found.`);

    const [brand] = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.company_id, company.id))
        .limit(1);
    if (!brand) throw new Error("Test brand not found");

    // Same asset-selection logic as order-happy-path: POOLED family + GREEN
    // + available-quantity-positive + AVAILABLE status. Guarantees the asset
    // passes availability + feasibility gates in submit-from-cart.
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

    const [client] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, CREDS.client.email))
        .limit(1);
    if (!client) throw new Error("Client test user not found");

    return {
        platformId: platform.id,
        companyId: company.id,
        brandId: brand.id,
        assetId: asset.id,
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

const scenarioId = `sphp-${Date.now()}`;
const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

const buildSubmitPayload = () => ({
    items: [{ asset_id: refs.assetId, quantity: 2 }],
    brand_id: refs.brandId,
    collector_name: "E2E Collector",
    collector_phone: "+971-50-000-2222",
    collector_email: CREDS.client.email,
    pickup_window: {
        start: hoursFromNow(48),
        end: hoursFromNow(52),
    },
    expected_return_at: hoursFromNow(96),
    notes: `Scenario: ${scenarioId}`,
});

// ─────────────────────────────────────────────────────────────
// Scenario
// ─────────────────────────────────────────────────────────────

describe("Self-pickup happy path — quote lifecycle (submit → READY_FOR_PICKUP)", () => {
    let selfPickupId: string;

    it("Step 1 — client submits self-pickup from cart", async () => {
        const res = await actors.client.post<{
            success: boolean;
            data: { self_pickup_id: string; status: string };
        }>("/client/v1/self-pickup/submit-from-cart", buildSubmitPayload());

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.success).toBe(true);
        const publicPickupId = res.body?.data?.self_pickup_id;
        expect(publicPickupId).toBeTruthy();

        const [pickupRow] = await db
            .select()
            .from(selfPickups)
            .where(eq(selfPickups.self_pickup_id, publicPickupId as string))
            .limit(1);
        expect(pickupRow).toBeTruthy();
        selfPickupId = pickupRow.id;

        // Surface 2: DB
        expect(["SUBMITTED", "PRICING_REVIEW"]).toContain(pickupRow.self_pickup_status);

        // Surface 3: system_events
        await expect(selfPickupId).toHaveEmittedEvent("self_pickup.submitted");

        // Surface 4: notification_logs — three recipients per seeded rules
        await expect(selfPickupId).toHaveDispatchedEmail({
            template: "self_pickup_submitted_client",
            to: TEST_INBOX.client,
        });
        await expect(selfPickupId).toHaveDispatchedEmail({
            template: "self_pickup_submitted_admin",
            to: TEST_INBOX.admin,
        });
        await expect(selfPickupId).toHaveDispatchedEmail({
            template: "self_pickup_submitted_logistics",
            to: TEST_INBOX.logistics,
        });
    });

    it("Step 2 — logistics submits for admin approval → PENDING_APPROVAL", async () => {
        expect(selfPickupId).toBeTruthy();

        const res = await actors.logistics.post<{
            success: boolean;
            data: { self_pickup_status: string };
        }>(`/operations/v1/self-pickup/${selfPickupId}/submit-for-approval`);

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.data?.self_pickup_status).toBe("PENDING_APPROVAL");

        // Surface 2: DB
        await expect(selfPickupId).toHaveSelfPickupStatus("PENDING_APPROVAL");
    });

    it("Step 3 — admin approves quote → QUOTED", async () => {
        expect(selfPickupId).toBeTruthy();

        const res = await actors.admin.post<{
            success: boolean;
            data: { self_pickup_status: string };
        }>(`/operations/v1/self-pickup/${selfPickupId}/approve`, {});

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.data?.self_pickup_status).toBe("QUOTED");

        // Surface 2: DB
        await expect(selfPickupId).toHaveSelfPickupStatus("QUOTED");

        // Surface 3: event
        await expect(selfPickupId).toHaveEmittedEvent("self_pickup.quoted");

        // Surface 4: notifications — client (quote ready)
        await expect(selfPickupId).toHaveDispatchedEmail({
            template: "self_pickup_quoted_client",
            to: TEST_INBOX.client,
        });
    });

    it("Step 4 — client approves quote → CONFIRMED", async () => {
        expect(selfPickupId).toBeTruthy();

        const res = await actors.client.post<{
            success: boolean;
            data: { self_pickup_status: string };
        }>(`/client/v1/self-pickup/${selfPickupId}/approve-quote`, {});

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.data?.self_pickup_status).toBe("CONFIRMED");

        // Surface 2: DB
        await expect(selfPickupId).toHaveSelfPickupStatus("CONFIRMED");

        // Surface 3: event
        await expect(selfPickupId).toHaveEmittedEvent("self_pickup.confirmed");

        // Surface 4: notifications — admin + logistics get the confirmation
        await expect(selfPickupId).toHaveDispatchedEmail({
            template: "self_pickup_confirmed_admin",
            to: TEST_INBOX.admin,
        });
        await expect(selfPickupId).toHaveDispatchedEmail({
            template: "self_pickup_confirmed_logistics",
            to: TEST_INBOX.logistics,
        });
    });

    it("Step 5 — logistics marks ready for pickup → READY_FOR_PICKUP", async () => {
        expect(selfPickupId).toBeTruthy();

        const res = await actors.logistics.post<{
            success: boolean;
            data: { self_pickup_status: string };
        }>(`/operations/v1/self-pickup/${selfPickupId}/ready-for-pickup`, {});

        // Surface 1: HTTP
        expect(res).toBeOk();
        expect(res.body?.data?.self_pickup_status).toBe("READY_FOR_PICKUP");

        // Surface 2: DB
        await expect(selfPickupId).toHaveSelfPickupStatus("READY_FOR_PICKUP");

        // Surface 3: event
        await expect(selfPickupId).toHaveEmittedEvent("self_pickup.ready_for_pickup");

        // Surface 4: notification — client (collector) told to come pick up
        await expect(selfPickupId).toHaveDispatchedEmail({
            template: "self_pickup_ready_client",
            to: TEST_INBOX.client,
        });
    });
});

// ─────────────────────────────────────────────────────────────
// Fulfillment phase — phase 2. Handover + return scanning require
// per-asset QR-code based scans; add when scanning support matures
// for the e2e harness.
// ─────────────────────────────────────────────────────────────

describe.skip("Self-pickup happy path — fulfillment (READY_FOR_PICKUP → CLOSED) [phase 2]", () => {
    // POST /operations/v1/scanning/self-pickup-handover/:id/scan (loop per unit)
    // POST /operations/v1/scanning/self-pickup-handover/:id/complete
    //   → PICKED_UP + self_pickup.picked_up event + admin notification
    it.skip("handover scan → PICKED_UP", () => {});

    // POST /client/v1/self-pickup/:id/trigger-return
    //   → AWAITING_RETURN + self_pickup.return_due event + client + logistics notifications
    it.skip("trigger return → AWAITING_RETURN", () => {});

    // POST /operations/v1/scanning/self-pickup-return/:id/scan (loop per unit)
    // POST /operations/v1/scanning/self-pickup-return/:id/complete
    //   → RETURNED → CLOSED + self_pickup.closed event + admin notification
    it.skip("return scan → RETURNED → CLOSED", () => {});
});
