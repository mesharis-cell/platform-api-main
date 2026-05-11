/**
 * Track 1 — Submit-time asset bookings.
 *
 * Verifies that orders + self-pickups create asset_bookings + decrement
 * available_quantity at SUBMIT time (not at quote-approval time), and that
 * the related lifecycle paths behave correctly:
 *
 *   S1 single submit creates bookings + decrements availability
 *   S2 concurrent submits cannot oversell single-stock asset
 *   S3 client decline-quote releases bookings + restores availability
 *   S4 client approve-quote is idempotent — no duplicate bookings
 *   S5 legacy in-flight order safety net — approve creates bookings if missing
 *   S6 SP submit race — concurrent SPs can't oversell
 *   S7 stuck-quote cron — auto-cancels post-event-end + grace, leaves long-lead alone
 *
 * Each test resets the asset state it depends on so tests are independent
 * within the file. Notification assertions are skipped here to keep the suite
 * fast — those are covered by order-happy-path.test.ts and self-pickup-happy-path.test.ts.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
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
    assets as assetsTable,
    brands,
    cities,
    companies,
    countries,
    orders,
    platforms,
    selfPickups,
    serviceTypes,
    users as usersTable,
} from "../../src/db/schema";
import { TEST_COMPANY_NAME, TEST_INBOX, TEST_PLATFORM_DOMAIN } from "../support/constants";
import { DEMO_UUIDS } from "../../src/db/seeds/demo-deterministic";

const CREDS = {
    admin: { email: TEST_INBOX.admin, password: "E2ePass!Admin1" },
    logistics: { email: TEST_INBOX.logistics, password: "E2ePass!Logi1" },
    client: { email: TEST_INBOX.client, password: "E2ePass!Client1" },
};

type SeedRefs = {
    platformId: string;
    companyId: string;
    countryId: string;
    cityId: string;
    brandId: string;
    chairAssetId: string;
    singleStockAssetId: string;
};

const loadSeedRefs = async (): Promise<SeedRefs> => {
    const [platform] = await db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.domain, TEST_PLATFORM_DOMAIN))
        .limit(1);
    if (!platform) throw new Error(`Platform ${TEST_PLATFORM_DOMAIN} not found`);

    const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.platform_id, platform.id), eq(companies.name, TEST_COMPANY_NAME)))
        .limit(1);
    if (!company) throw new Error(`Company ${TEST_COMPANY_NAME} not found`);

    const [country] = await db
        .select({ id: countries.id })
        .from(countries)
        .where(eq(countries.platform_id, platform.id))
        .limit(1);
    if (!country) throw new Error("Country not found");

    const [city] = await db
        .select({ id: cities.id })
        .from(cities)
        .where(eq(cities.platform_id, platform.id))
        .limit(1);
    if (!city) throw new Error("City not found");

    const [brand] = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.company_id, company.id))
        .limit(1);
    if (!brand) throw new Error("Brand not found");

    return {
        platformId: platform.id,
        companyId: company.id,
        countryId: country.id,
        cityId: city.id,
        brandId: brand.id,
        chairAssetId: DEMO_UUIDS.assets.eventChairsBatch,
        singleStockAssetId: DEMO_UUIDS.assets.singleStockMicrophone,
    };
};

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
    // Restore the assets we mutated to a known-AVAILABLE state so subsequent
    // scenario files (order-happy-path, self-pickup-happy-path) can find a
    // GREEN+AVAILABLE+available_quantity>0 POOLED asset for their seed-refs query.
    await db.execute(sql`
        DELETE FROM asset_bookings;
        DELETE FROM line_items;
        DELETE FROM order_status_history;
        DELETE FROM order_items;
        DELETE FROM self_pickup_status_history;
        DELETE FROM self_pickup_items;
        DELETE FROM self_pickups;
        DELETE FROM orders;
        DELETE FROM prices;
        DELETE FROM financial_status_history;
        DELETE FROM system_events;
    `);
    await db
        .update(assetsTable)
        .set({ total_quantity: 30, available_quantity: 30, status: "AVAILABLE" })
        .where(eq(assetsTable.id, refs.chairAssetId));
    await db
        .update(assetsTable)
        .set({ total_quantity: 1, available_quantity: 1, status: "AVAILABLE" })
        .where(eq(assetsTable.id, refs.singleStockAssetId));
    await suite?.stop();
});

// Wipe every per-test side-effect (orders, SPs, bookings, pricing) before each
// test so tests are independent. DELETE rather than TRUNCATE avoids exclusive
// table locks that can block on long-running queue/notification ops.
const cleanPerTest = async () => {
    await db.execute(sql`
        DELETE FROM asset_bookings;
        DELETE FROM line_items;
        DELETE FROM order_status_history;
        DELETE FROM order_items;
        DELETE FROM self_pickup_status_history;
        DELETE FROM self_pickup_items;
        DELETE FROM self_pickups;
        DELETE FROM orders;
        DELETE FROM prices;
        DELETE FROM financial_status_history;
        DELETE FROM system_events;
    `);
};

const daysFromNow = (n: number) =>
    new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const resetAsset = async (assetId: string, qty: number) => {
    await db
        .update(assetsTable)
        .set({ available_quantity: qty, total_quantity: qty, status: "AVAILABLE" })
        .where(eq(assetsTable.id, assetId));
};

const buildOrderPayload = (overrides: Record<string, unknown> = {}) => ({
    items: [{ asset_id: refs.chairAssetId, quantity: 3 }],
    brand_id: refs.brandId,
    event_start_date: daysFromNow(7),
    event_end_date: daysFromNow(9),
    venue_name: "Track1 Venue",
    venue_country_id: refs.countryId,
    venue_city_id: refs.cityId,
    venue_address: "Test venue, Dubai",
    contact_name: "E2E Client",
    contact_email: CREDS.client.email,
    contact_phone: "+971-50-000-1111",
    ...overrides,
});

const buildSpPayload = (overrides: Record<string, unknown> = {}) => ({
    items: [{ asset_id: refs.chairAssetId, quantity: 2 }],
    brand_id: refs.brandId,
    collector_name: "E2E Collector",
    collector_phone: "+971-50-000-2222",
    collector_email: CREDS.client.email,
    pickup_window: {
        start: `${daysFromNow(5)}T09:00:00.000Z`,
        end: `${daysFromNow(5)}T17:00:00.000Z`,
    },
    expected_return_at: `${daysFromNow(8)}T17:00:00.000Z`,
    notes: "Track 1 SP test",
    ...overrides,
});

const submitOrder = async (payload: Record<string, unknown>) => {
    const res = await actors.client.post<{
        success: boolean;
        data?: { order_id?: string };
    }>("/client/v1/order/submit-from-cart", payload);
    return res;
};

const lookupOrderByPublicId = async (publicId: string) => {
    const [row] = await db.select().from(orders).where(eq(orders.order_id, publicId)).limit(1);
    return row;
};

// Pushes an order through the full quote flow to QUOTED so we can test
// approve/decline + cron behavior. Returns the DB order row.
const pushToQuoted = async (assetId: string, qty: number) => {
    const submitRes = await submitOrder(
        buildOrderPayload({ items: [{ asset_id: assetId, quantity: qty }] })
    );
    expect(submitRes).toBeOk();
    const publicId = submitRes.body!.data!.order_id!;
    const orderRow = await lookupOrderByPublicId(publicId);
    expect(orderRow).toBeTruthy();

    // Logistics adds a catalog line item (need at least one for pricing rebuild).
    const [serviceType] = await db
        .select({ id: serviceTypes.id })
        .from(serviceTypes)
        .where(
            and(
                eq(serviceTypes.platform_id, refs.platformId),
                eq(serviceTypes.category, "ASSEMBLY")
            )
        )
        .limit(1);
    if (!serviceType) throw new Error("ASSEMBLY service type not seeded");
    const liRes = await actors.logistics.post(`/operations/v1/line-item/catalog`, {
        purpose_type: "ORDER",
        order_id: orderRow.id,
        service_type_id: serviceType.id,
        quantity: 1,
        billing_mode: "BILLABLE",
        notes: "Track1 line item",
    });
    expect(liRes.status).toBe(201);

    // Submit for approval.
    const sfaRes = await actors.logistics.post(
        `/operations/v1/order/${orderRow.id}/submit-for-approval`
    );
    expect(sfaRes).toBeOk();

    // Admin approves the quote.
    const approveRes = await actors.admin.post(
        `/operations/v1/order/${orderRow.id}/admin-approve-quote`,
        {}
    );
    expect(approveRes).toBeOk();

    return orderRow;
};

// ─────────────────────────────────────────────────────────────
// S1
// ─────────────────────────────────────────────────────────────

describe("S1 — Single submit creates bookings + decrements availability", () => {
    beforeEach(async () => {
        await cleanPerTest();
        await resetAsset(refs.chairAssetId, 30);
    });

    it("creates asset_bookings + decrements available_quantity by 3", async () => {
        const [pre] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));

        const res = await submitOrder(buildOrderPayload());
        expect(res).toBeOk();

        const orderRow = await lookupOrderByPublicId(res.body!.data!.order_id!);
        expect(orderRow).toBeTruthy();
        expect(["SUBMITTED", "PRICING_REVIEW"]).toContain(orderRow.order_status);

        const bookings = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderRow.id));
        expect(bookings.length).toBe(1);
        expect(bookings[0].quantity).toBe(3);
        expect(bookings[0].asset_id).toBe(refs.chairAssetId);

        const [post] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));
        expect(post.available).toBe(pre.available - 3);
    });
});

// ─────────────────────────────────────────────────────────────
// S2
// ─────────────────────────────────────────────────────────────

describe("S2 — Concurrent submits cannot oversell", () => {
    beforeEach(async () => {
        await cleanPerTest();
        await resetAsset(refs.singleStockAssetId, 1);
    });

    it("two concurrent submits for qty=1 single-stock asset → exactly one wins", async () => {
        const payload = buildOrderPayload({
            items: [{ asset_id: refs.singleStockAssetId, quantity: 1 }],
        });

        const [r1, r2] = await Promise.all([submitOrder(payload), submitOrder(payload)]);

        const successes = [r1, r2].filter((r) => r.status >= 200 && r.status < 300);
        const failures = [r1, r2].filter((r) => r.status >= 400);
        expect(successes.length).toBe(1);
        expect(failures.length).toBe(1);

        // available_quantity is exactly 0, NEVER -1
        const [asset] = await db
            .select({
                available: assetsTable.available_quantity,
                total: assetsTable.total_quantity,
            })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.singleStockAssetId));
        expect(asset.available).toBe(0);
        expect(asset.total).toBe(1);

        // Exactly one ORDER asset_bookings row for this asset.
        const bookings = await db
            .select()
            .from(assetBookings)
            .where(
                and(
                    eq(assetBookings.asset_id, refs.singleStockAssetId),
                    sql`${assetBookings.order_id} IS NOT NULL`
                )
            );
        expect(bookings.length).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────
// S3
// ─────────────────────────────────────────────────────────────

describe("S3 — Decline quote releases bookings", () => {
    beforeEach(async () => {
        await cleanPerTest();
        await resetAsset(refs.chairAssetId, 30);
    });

    it("client decline-quote releases bookings + restores available_quantity", async () => {
        const [pre] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));

        const orderRow = await pushToQuoted(refs.chairAssetId, 3);

        // After QUOTED, bookings exist + availability decremented.
        const bookingsBefore = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderRow.id));
        expect(bookingsBefore.length).toBe(1);

        const declineRes = await actors.client.patch(
            `/client/v1/order/${orderRow.id}/decline-quote`,
            { decline_reason: "Test scenario S3 — declining the quote" }
        );
        expect(declineRes).toBeOk();

        await expect(orderRow.id).toHaveOrderStatus("DECLINED");

        // Bookings released.
        const bookingsAfter = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderRow.id));
        expect(bookingsAfter.length).toBe(0);

        // available_quantity restored to pre-submit value.
        const [post] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));
        expect(post.available).toBe(pre.available);
    });
});

// ─────────────────────────────────────────────────────────────
// S4
// ─────────────────────────────────────────────────────────────

describe("S4 — Approve quote is idempotent (no duplicate bookings)", () => {
    beforeEach(async () => {
        await cleanPerTest();
        await resetAsset(refs.chairAssetId, 30);
    });

    it("client approve-quote does NOT duplicate asset_bookings rows", async () => {
        const orderRow = await pushToQuoted(refs.chairAssetId, 3);

        const bookingsBefore = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderRow.id));
        expect(bookingsBefore.length).toBe(1);

        const [availBefore] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));

        const approveRes = await actors.client.patch(
            `/client/v1/order/${orderRow.id}/approve-quote`,
            { po_number: `PO-S4-${Date.now()}`, notes: "S4 approval" }
        );
        expect(approveRes).toBeOk();
        await expect(orderRow.id).toHaveOrderStatus("CONFIRMED");

        const bookingsAfter = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderRow.id));
        expect(bookingsAfter.length).toBe(1);

        const [availAfter] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));
        expect(availAfter.available).toBe(availBefore.available);
    });
});

// ─────────────────────────────────────────────────────────────
// S5
// ─────────────────────────────────────────────────────────────

describe("S5 — Legacy in-flight order safety net", () => {
    beforeEach(async () => {
        await cleanPerTest();
        await resetAsset(refs.chairAssetId, 30);
    });

    it("approve creates bookings if pre-Phase-2 order has none", async () => {
        const orderRow = await pushToQuoted(refs.chairAssetId, 3);

        // Simulate a pre-Phase-2 state: delete the asset_bookings + restore
        // available_quantity to mimic an order that never had submit-time bookings.
        await db.delete(assetBookings).where(eq(assetBookings.order_id, orderRow.id));
        await db
            .update(assetsTable)
            .set({ available_quantity: sql`${assetsTable.available_quantity} + 3` })
            .where(eq(assetsTable.id, refs.chairAssetId));

        const bookingsMid = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderRow.id));
        expect(bookingsMid.length).toBe(0);

        const [availMid] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));

        const approveRes = await actors.client.patch(
            `/client/v1/order/${orderRow.id}/approve-quote`,
            { po_number: `PO-S5-${Date.now()}`, notes: "S5 legacy safety net" }
        );
        expect(approveRes).toBeOk();
        await expect(orderRow.id).toHaveOrderStatus("CONFIRMED");

        // Safety net: bookings now exist.
        const bookingsAfter = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, orderRow.id));
        expect(bookingsAfter.length).toBe(1);
        expect(bookingsAfter[0].quantity).toBe(3);

        // available decremented again by 3.
        const [availAfter] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.chairAssetId));
        expect(availAfter.available).toBe(availMid.available - 3);
    });
});

// ─────────────────────────────────────────────────────────────
// S6
// ─────────────────────────────────────────────────────────────

describe("S6 — SP submit race cannot oversell", () => {
    beforeEach(async () => {
        await cleanPerTest();
        await resetAsset(refs.singleStockAssetId, 1);
    });

    it("two concurrent SP submits for qty=1 single-stock asset → exactly one wins", async () => {
        const payload = buildSpPayload({
            items: [{ asset_id: refs.singleStockAssetId, quantity: 1 }],
        });

        const [r1, r2] = await Promise.all([
            actors.client.post("/client/v1/self-pickup/submit-from-cart", payload),
            actors.client.post("/client/v1/self-pickup/submit-from-cart", payload),
        ]);

        const successes = [r1, r2].filter((r) => r.status >= 200 && r.status < 300);
        const failures = [r1, r2].filter((r) => r.status >= 400);
        expect(successes.length).toBe(1);
        expect(failures.length).toBe(1);

        const [asset] = await db
            .select({ available: assetsTable.available_quantity })
            .from(assetsTable)
            .where(eq(assetsTable.id, refs.singleStockAssetId));
        expect(asset.available).toBe(0);

        // Filter to SP-only bookings (cleanPerTest already wiped, but safe-guard)
        const bookings = await db
            .select()
            .from(assetBookings)
            .where(
                and(
                    eq(assetBookings.asset_id, refs.singleStockAssetId),
                    sql`${assetBookings.self_pickup_id} IS NOT NULL`
                )
            );
        expect(bookings.length).toBe(1);
        expect(bookings[0].self_pickup_id).not.toBeNull();
        expect(bookings[0].order_id).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────
// S7 — stuck quote cron
// ─────────────────────────────────────────────────────────────

describe("S7 — Stuck-quote auto-expiry cron", () => {
    beforeEach(async () => {
        await cleanPerTest();
        await resetAsset(refs.chairAssetId, 60);
    });

    it("cancels QUOTED order whose event_end_date is past + grace period", async () => {
        const stuckOrder = await pushToQuoted(refs.chairAssetId, 3);
        const safeOrder = await pushToQuoted(refs.chairAssetId, 3); // 5 days past, should NOT cancel
        const futureOrder = await pushToQuoted(refs.chairAssetId, 3); // 30 days future, should NOT cancel

        // stuckOrder: event_end_date 30 days ago → past + grace, should cancel
        await db
            .update(orders)
            .set({
                event_end_date: sql`now() - interval '30 days'`,
                event_start_date: sql`now() - interval '32 days'`,
            })
            .where(eq(orders.id, stuckOrder.id));

        // safeOrder: event_end_date 5 days ago → past but within grace, should NOT cancel
        await db
            .update(orders)
            .set({
                event_end_date: sql`now() - interval '5 days'`,
                event_start_date: sql`now() - interval '7 days'`,
            })
            .where(eq(orders.id, safeOrder.id));

        // futureOrder: keep default (7-9 days future) — should NOT cancel.
        const { CronServices } = await import("../../src/app/modules/cron/cron.services");
        await CronServices.expireStuckQuotes();

        // stuckOrder is CANCELLED + bookings released
        await expect(stuckOrder.id).toHaveOrderStatus("CANCELLED");
        const stuckBookings = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, stuckOrder.id));
        expect(stuckBookings.length).toBe(0);

        // safeOrder still QUOTED + bookings still present
        await expect(safeOrder.id).toHaveOrderStatus("QUOTED");
        const safeBookings = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, safeOrder.id));
        expect(safeBookings.length).toBe(1);

        // futureOrder still QUOTED + bookings still present
        await expect(futureOrder.id).toHaveOrderStatus("QUOTED");
        const futureBookings = await db
            .select()
            .from(assetBookings)
            .where(eq(assetBookings.order_id, futureOrder.id));
        expect(futureBookings.length).toBe(1);
    });
});
