/**
 * Track 3 — DB invariants (negative tests).
 *
 * Verifies that PostgreSQL CHECK constraints enforce the invariants the
 * application code relies on. These are pure DB-level tests — no HTTP, no
 * services, just raw SQL inserts/updates that should fail with a
 * 23514 (check_violation) error.
 *
 *   N1 asset_bookings.quantity > 0
 *   N2 asset_bookings.blocked_from <= blocked_until
 *   N3 assets.available_quantity <= total_quantity
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import {
    truncateBusinessData,
    verifySchema,
    bootstrapSuite,
    type SuiteHandle,
} from "../setup/lifecycle";
import { db } from "../support/db";
import { assets as assetsTable, brands, companies, platforms } from "../../src/db/schema";
import { TEST_COMPANY_NAME, TEST_PLATFORM_DOMAIN } from "../support/constants";
import { DEMO_UUIDS } from "../../src/db/seeds/demo-deterministic";

type SeedRefs = {
    platformId: string;
    companyId: string;
    brandId: string;
    chairAssetId: string;
};

const loadSeedRefs = async (): Promise<SeedRefs> => {
    const [platform] = await db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.domain, TEST_PLATFORM_DOMAIN))
        .limit(1);
    if (!platform) throw new Error(`Platform not found`);

    const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.platform_id, platform.id))
        .limit(1);
    const [brand] = await db
        .select({ id: brands.id })
        .from(brands)
        .where(eq(brands.company_id, company!.id))
        .limit(1);

    return {
        platformId: platform.id,
        companyId: company!.id,
        brandId: brand!.id,
        chairAssetId: DEMO_UUIDS.assets.eventChairsBatch,
    };
};

let suite: SuiteHandle;
let refs: SeedRefs;

beforeAll(async () => {
    await verifySchema();
    await truncateBusinessData();
    refs = await loadSeedRefs();
    // Boot the suite even though we don't use HTTP — keeps lifecycle parity
    // with the other scenario files (notification queue, etc.).
    suite = await bootstrapSuite();
});

afterAll(async () => {
    // N3 sets chair to total=10/available=8 — restore so other scenario files
    // find a fresh GREEN+AVAILABLE pool.
    await db
        .update(assetsTable)
        .set({ total_quantity: 30, available_quantity: 30, status: "AVAILABLE" })
        .where(eq(assetsTable.id, refs.chairAssetId));
    await suite?.stop();
});

// Drizzle wraps PG errors into a generic "Failed query: ..." message with the
// underlying pg error living on `.cause`. Helper extracts the actual constraint
// name + sqlstate so assertions can target either.
const inspectPgError = (err: any) => {
    const code = err?.code ?? err?.cause?.code;
    const constraint = err?.constraint ?? err?.cause?.constraint;
    return { code, constraint };
};

// ─────────────────────────────────────────────────────────────
// N1 — asset_bookings.quantity > 0
// ─────────────────────────────────────────────────────────────

describe("N1 — asset_bookings.quantity > 0", () => {
    it("rejects INSERT with quantity = 0", async () => {
        let err: any = null;
        try {
            await db.execute(sql`
                INSERT INTO asset_bookings (
                    id, asset_id, order_id, self_pickup_id,
                    quantity, blocked_from, blocked_until, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), ${refs.chairAssetId}, NULL, NULL,
                    0, now(), now() + interval '1 day', now(), now()
                )
            `);
        } catch (e) {
            err = e;
        }
        expect(err).toBeTruthy();
        const { code, constraint } = inspectPgError(err);
        expect(code).toBe("23514");
        expect(constraint).toBe("asset_bookings_quantity_positive_chk");
    });

    it("rejects INSERT with quantity = -1", async () => {
        let err: any = null;
        try {
            await db.execute(sql`
                INSERT INTO asset_bookings (
                    id, asset_id, order_id, self_pickup_id,
                    quantity, blocked_from, blocked_until, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), ${refs.chairAssetId}, NULL, NULL,
                    -1, now(), now() + interval '1 day', now(), now()
                )
            `);
        } catch (e) {
            err = e;
        }
        expect(err).toBeTruthy();
        const { code, constraint } = inspectPgError(err);
        expect(code).toBe("23514");
        expect(constraint).toBe("asset_bookings_quantity_positive_chk");
    });
});

// ─────────────────────────────────────────────────────────────
// N2 — asset_bookings.blocked_from <= blocked_until
// ─────────────────────────────────────────────────────────────

describe("N2 — asset_bookings.blocked_from <= blocked_until", () => {
    it("rejects INSERT with blocked_from > blocked_until", async () => {
        let err: any = null;
        try {
            await db.execute(sql`
                INSERT INTO asset_bookings (
                    id, asset_id, order_id, self_pickup_id,
                    quantity, blocked_from, blocked_until, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), ${refs.chairAssetId}, NULL, NULL,
                    1, now() + interval '2 days', now(), now(), now()
                )
            `);
        } catch (e) {
            err = e;
        }
        expect(err).toBeTruthy();
        const { code, constraint } = inspectPgError(err);
        expect(code).toBe("23514");
        expect(constraint).toBe("asset_bookings_window_valid_chk");
    });
});

// ─────────────────────────────────────────────────────────────
// N3 — assets.available_quantity <= total_quantity
// ─────────────────────────────────────────────────────────────

describe("N3 — assets.available_quantity <= total_quantity", () => {
    it("rejects UPDATE that sets available_quantity > total_quantity", async () => {
        // Set known starting state.
        await db
            .update(assetsTable)
            .set({ total_quantity: 5, available_quantity: 5 })
            .where(eq(assetsTable.id, refs.chairAssetId));

        let err: any = null;
        try {
            await db
                .update(assetsTable)
                .set({ available_quantity: 6 })
                .where(eq(assetsTable.id, refs.chairAssetId));
        } catch (e) {
            err = e;
        }
        expect(err).toBeTruthy();
        const { code, constraint } = inspectPgError(err);
        expect(code).toBe("23514");
        expect(constraint).toBe("assets_available_le_total");
    });

    it("rejects UPDATE that lowers total_quantity below available_quantity", async () => {
        await db
            .update(assetsTable)
            .set({ total_quantity: 10, available_quantity: 8 })
            .where(eq(assetsTable.id, refs.chairAssetId));

        let err: any = null;
        try {
            await db
                .update(assetsTable)
                .set({ total_quantity: 7 })
                .where(eq(assetsTable.id, refs.chairAssetId));
        } catch (e) {
            err = e;
        }
        expect(err).toBeTruthy();
        const { code, constraint } = inspectPgError(err);
        expect(code).toBe("23514");
        expect(constraint).toBe("assets_available_le_total");
    });
});
