/**
 * Deterministic helpers for the demo seed.
 *
 * Timestamps, IDs, and order numbers in `demo-*` seed modules must be stable
 * across reseeds so screenshot diffs captured by the docs agent's Playwright
 * suite reflect ONLY UI changes — not a garbage cloud of "every ID / date
 * changed on reseed." That means:
 *
 *   - Dates computed from a pinned epoch, not `new Date()` / `Date.now()`.
 *   - Fixed UUIDs for every entity the demo directly depends on
 *     (platform, company, brands, asset families, assets, orders, users
 *     whose IDs are referenced elsewhere — logistics and Alex Chen).
 *   - Fixed public order_id strings (`ORD-DEMO-001` ... `ORD-DEMO-006`).
 *
 * UUIDs MUST be valid v4 format (segment 3 starts with `4`, segment 4 starts
 * with `8`/`9`/`a`/`b`) — the API's Zod `.uuid()` validators reject anything
 * else with "Invalid <field> ID." Within those constraints we encode entity
 * type in segment 4: 8001=platform, 8002=company, 8010-8019=users,
 * 8020-8029=brands, 8030-8039=families, 8040-8049=assets, 8050-8059=orders,
 * 8060-8069=service requests, 8070-8079=self-pickups,
 * 8080-8089=stock_movements, etc.
 */

/**
 * All demo timestamps are computed relative to this instant so they survive
 * reseeds unchanged. Choose a date in the recent past so fulfilled orders
 * (DELIVERED / CLOSED) have plausibly-past event windows relative to "now."
 */
export const DEMO_EPOCH = new Date("2026-04-01T00:00:00Z");

const DAY_MS = 24 * 60 * 60 * 1000;

export const daysFromEpoch = (n: number): Date => new Date(DEMO_EPOCH.getTime() + n * DAY_MS);

export const DEMO_UUIDS = {
    platform: "00000000-0000-4000-8001-000000000001",
    company: "00000000-0000-4000-8002-000000000001",

    users: {
        // E2E inbox-alias users (email tests) — IDs not fixed since E2E
        // scenario looks them up by email. Listed here for documentation only.
        // admin:     looked up by email
        // logistics: looked up by email  (scan_events reference it — looked
        //            up post-seed, no need to fix here)
        // e2eClient: looked up by email
        // Alex Chen (docs client) — fixed because demo orders reference it.
        docsClient: "00000000-0000-4000-8010-000000000001",
    },

    brands: {
        primary: "00000000-0000-4000-8020-000000000001",
        secondary: "00000000-0000-4000-8020-000000000002",
    },

    assetCategories: {
        furniture: "00000000-0000-4000-8025-000000000001",
        glassware: "00000000-0000-4000-8025-000000000002",
        installation: "00000000-0000-4000-8025-000000000003",
        decor: "00000000-0000-4000-8025-000000000004",
        general: "00000000-0000-4000-8025-000000000005",
        unknown: "00000000-0000-4000-8025-000000000006",
    },

    families: {
        eventChairs: "00000000-0000-4000-8030-000000000001",
        backdropPanels: "00000000-0000-4000-8030-000000000002",
        ledScreens: "00000000-0000-4000-8030-000000000003",
        singleStockTest: "00000000-0000-4000-8030-000000000004",
    },

    assets: {
        eventChairsBatch: "00000000-0000-4000-8040-000000000001",
        backdropGreen1: "00000000-0000-4000-8040-000000000010",
        backdropGreen2: "00000000-0000-4000-8040-000000000011",
        backdropOrange: "00000000-0000-4000-8040-000000000012",
        backdropRed: "00000000-0000-4000-8040-000000000013",
        ledScreen1: "00000000-0000-4000-8040-000000000020",
        ledScreen2: "00000000-0000-4000-8040-000000000021",
        ledScreen3: "00000000-0000-4000-8040-000000000022",
        singleStockMicrophone: "00000000-0000-4000-8040-000000000030",
    },

    collection: "00000000-0000-4000-8045-000000000001",

    orders: {
        order1Submitted: "00000000-0000-4000-8050-000000000001",
        order2Quoted: "00000000-0000-4000-8050-000000000002",
        order3Confirmed: "00000000-0000-4000-8050-000000000003",
        order4Delivered: "00000000-0000-4000-8050-000000000004",
        order5Closed: "00000000-0000-4000-8050-000000000005",
        order6Cancelled: "00000000-0000-4000-8050-000000000006",
    },

    serviceRequest: "00000000-0000-4000-8060-000000000001",

    selfPickups: {
        sp1PricingReview: "00000000-0000-4000-8070-000000000001",
        sp2Quoted: "00000000-0000-4000-8070-000000000002",
        sp3Confirmed: "00000000-0000-4000-8070-000000000003",
        sp4ReadyForPickup: "00000000-0000-4000-8070-000000000004",
        sp5Closed: "00000000-0000-4000-8070-000000000005",
        sp6Cancelled: "00000000-0000-4000-8070-000000000006",
    },

    stockMovements: {
        outboundFromOrder4: "00000000-0000-4000-8080-000000000001",
        inboundFromOrder5: "00000000-0000-4000-8080-000000000002",
        adjustmentNeg1: "00000000-0000-4000-8080-000000000003",
        adjustmentPos1: "00000000-0000-4000-8080-000000000004",
        adHocReplacement: "00000000-0000-4000-8080-000000000005",
        adHocInstallConsumption: "00000000-0000-4000-8080-000000000006",
        adHocRepurposed: "00000000-0000-4000-8080-000000000007",
        adHocOther: "00000000-0000-4000-8080-000000000008",
        writeOffDamaged: "00000000-0000-4000-8080-000000000009",
    },
} as const;

export const DEMO_ORDER_IDS = {
    order1Submitted: "ORD-DEMO-001",
    order2Quoted: "ORD-DEMO-002",
    order3Confirmed: "ORD-DEMO-003",
    order4Delivered: "ORD-DEMO-004",
    order5Closed: "ORD-DEMO-005",
    order6Cancelled: "ORD-DEMO-006",
} as const;

export const DEMO_SELF_PICKUP_IDS = {
    sp1PricingReview: "SPK-DEMO-001",
    sp2Quoted: "SPK-DEMO-002",
    sp3Confirmed: "SPK-DEMO-003",
    sp4ReadyForPickup: "SPK-DEMO-004",
    sp5Closed: "SPK-DEMO-005",
    sp6Cancelled: "SPK-DEMO-006",
} as const;
