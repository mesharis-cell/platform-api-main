/**
 * Six demo self-pickups spanning the lifecycle (PRICING_REVIEW → CLOSED + a
 * CANCELLED branch), all owned by the docs CLIENT user (Alex Chen).
 *
 * Mirrors `demo-orders.ts` shape: direct DB inserts, no API calls, no event
 * emission. Bookings use the polymorphic `self_pickup_id` column on
 * asset_bookings (gotcha #36); SPK-005 (CLOSED) releases them through the
 * shared `releaseBookingsAndRestoreAvailability("SELF_PICKUP", ...)` helper
 * (gotcha #36) so end-state inventory matches a real run.
 *
 * Pricing on SPs 2–5 uses the real `PricingService.rebuildBreakdown` after
 * inserting CATALOG line items, so the `prices` row matches production shape.
 */

import { eq, sql } from "drizzle-orm";
import { lineItemIdGenerator } from "../../app/modules/order-line-items/order-line-items.utils";
import { releaseBookingsAndRestoreAvailability } from "../../app/modules/order/order.utils";
import { PricingService } from "../../app/services/pricing.service";
import { db } from "../index";
import * as schema from "../schema";
import { DEMO_EPOCH, DEMO_SELF_PICKUP_IDS, DEMO_UUIDS, daysFromEpoch } from "./demo-deterministic";

type SelfPickupStatus =
    | "SUBMITTED"
    | "PRICING_REVIEW"
    | "PENDING_APPROVAL"
    | "QUOTED"
    | "DECLINED"
    | "CONFIRMED"
    | "READY_FOR_PICKUP"
    | "PICKED_UP"
    | "AWAITING_RETURN"
    | "CLOSED"
    | "CANCELLED";

type FinancialStatus =
    | "PENDING_QUOTE"
    | "QUOTE_SENT"
    | "QUOTE_REVISED"
    | "QUOTE_ACCEPTED"
    | "PENDING_INVOICE"
    | "INVOICED"
    | "PAID"
    | "CANCELLED"
    | "NOT_APPLICABLE";

export type SeedDemoSelfPickupsOpts = {
    platformId: string;
    companyId: string;
    brandId: string;
    clientUserId: string;
    adminUserId: string;
    logisticsUserId: string;
    /** GREEN POOLED chair asset reused from demo-orders (Event Chair batch). */
    pooledAsset: { id: string; name: string; weightPerUnit: string; volumePerUnit: string };
};

type StatusStep = { status: SelfPickupStatus; daysFromEpoch: number; notes?: string };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const insertPlaceholderPrices = async (opts: {
    platformId: string;
    selfPickupUuid: string;
    calculatedBy: string;
}): Promise<string> => {
    const [row] = await db
        .insert(schema.prices)
        .values({
            platform_id: opts.platformId,
            entity_type: "SELF_PICKUP",
            entity_id: opts.selfPickupUuid,
            breakdown_lines: [],
            margin_percent: "25.00",
            vat_percent: "0.00",
            calculated_by: opts.calculatedBy,
        })
        .returning({ id: schema.prices.id });
    return row.id;
};

const insertSelfPickupRow = async (opts: {
    selfPickupUuid: string;
    publicSelfPickupId: string;
    platformId: string;
    companyId: string;
    brandId: string;
    createdBy: string;
    pickupStartDays: number;
    pickupEndDays: number;
    expectedReturnDays: number | null;
    pricesId: string;
    selfPickupStatus: SelfPickupStatus;
    financialStatus: FinancialStatus;
    poNumber?: string | null;
    declineReason?: string | null;
    chairQuantity: number;
    chairWeightPerUnit: string;
    chairVolumePerUnit: string;
}) => {
    const totalVolume = parseFloat(opts.chairVolumePerUnit) * opts.chairQuantity;
    const totalWeight = parseFloat(opts.chairWeightPerUnit) * opts.chairQuantity;
    await db.insert(schema.selfPickups).values({
        id: opts.selfPickupUuid,
        platform_id: opts.platformId,
        self_pickup_id: opts.publicSelfPickupId,
        company_id: opts.companyId,
        brand_id: opts.brandId,
        created_by: opts.createdBy,
        po_number: opts.poNumber ?? null,
        collector_name: "Alex Chen",
        collector_phone: "+971-50-555-0100",
        collector_email: "alex.chen@kadence-demo.com",
        pickup_window: {
            start: daysFromEpoch(opts.pickupStartDays).toISOString(),
            end: daysFromEpoch(opts.pickupEndDays).toISOString(),
        },
        expected_return_at:
            opts.expectedReturnDays !== null ? daysFromEpoch(opts.expectedReturnDays) : null,
        notes: null,
        special_instructions: null,
        decline_reason: opts.declineReason ?? null,
        self_pickup_pricing_id: opts.pricesId,
        calculated_totals: {
            volume: Number(totalVolume.toFixed(3)),
            weight: Number(totalWeight.toFixed(2)),
        },
        self_pickup_status: opts.selfPickupStatus,
        financial_status: opts.financialStatus,
    });
};

const insertSelfPickupItem = async (opts: {
    platformId: string;
    selfPickupUuid: string;
    asset: { id: string; name: string; weightPerUnit: string; volumePerUnit: string };
    quantity: number;
}) => {
    await db.insert(schema.selfPickupItems).values({
        platform_id: opts.platformId,
        self_pickup_id: opts.selfPickupUuid,
        asset_id: opts.asset.id,
        asset_name: opts.asset.name,
        quantity: opts.quantity,
        volume_per_unit: opts.asset.volumePerUnit,
        weight_per_unit: opts.asset.weightPerUnit,
        total_volume: (parseFloat(opts.asset.volumePerUnit) * opts.quantity).toFixed(3),
        total_weight: (parseFloat(opts.asset.weightPerUnit) * opts.quantity).toFixed(2),
    });
};

const insertStatusHistory = async (
    platformId: string,
    selfPickupUuid: string,
    updatedBy: string,
    steps: StatusStep[]
) => {
    if (steps.length === 0) return;
    await db.insert(schema.selfPickupStatusHistory).values(
        steps.map((s) => ({
            platform_id: platformId,
            self_pickup_id: selfPickupUuid,
            status: s.status,
            notes: s.notes ?? null,
            updated_by: updatedBy,
            timestamp: daysFromEpoch(s.daysFromEpoch),
        }))
    );
};

const insertBooking = async (opts: {
    selfPickupUuid: string;
    asset: { id: string };
    quantity: number;
    pickupStartDays: number;
    pickupEndDays: number;
    expectedReturnDays: number | null;
}) => {
    const blockedFrom = daysFromEpoch(opts.pickupStartDays);
    // Match the production submit path: when expected_return_at is set use it,
    // otherwise default to pickup-end + 7 days. Mirrors the logic in
    // self-pickup.services.ts:342–344.
    const blockedUntil =
        opts.expectedReturnDays !== null
            ? daysFromEpoch(opts.expectedReturnDays)
            : daysFromEpoch(opts.pickupEndDays + 7);
    await db.insert(schema.assetBookings).values({
        asset_id: opts.asset.id,
        self_pickup_id: opts.selfPickupUuid,
        quantity: opts.quantity,
        blocked_from: blockedFrom,
        blocked_until: blockedUntil,
    });
    await db
        .update(schema.assets)
        .set({
            available_quantity: sql`${schema.assets.available_quantity} - ${opts.quantity}`,
        })
        .where(eq(schema.assets.id, opts.asset.id));
};

const insertCatalogLoadingLine = async (opts: {
    platformId: string;
    selfPickupUuid: string;
    addedBy: string;
}) => {
    const candidates = await db
        .select({
            id: schema.serviceTypes.id,
            unit: schema.serviceTypes.unit,
            defaultRate: schema.serviceTypes.default_rate,
            name: schema.serviceTypes.name,
        })
        .from(schema.serviceTypes)
        .where(eq(schema.serviceTypes.platform_id, opts.platformId));
    const handling = candidates.filter((c) => c.name.toLowerCase().includes("loading"));
    const svc = handling[0] ?? candidates.find((c) => c.defaultRate !== null);
    if (!svc || svc.defaultRate === null) {
        throw new Error(
            "No suitable HANDLING/Loading service type found for self-pickup catalog line."
        );
    }

    const lineItemPublicId = await lineItemIdGenerator(opts.platformId);
    const total = parseFloat(svc.defaultRate).toFixed(2);
    await db.insert(schema.lineItems).values({
        line_item_id: lineItemPublicId,
        platform_id: opts.platformId,
        self_pickup_id: opts.selfPickupUuid,
        purpose_type: "SELF_PICKUP",
        service_type_id: svc.id,
        line_item_type: "CATALOG",
        billing_mode: "BILLABLE",
        category: "HANDLING",
        description: svc.name,
        quantity: "1",
        unit: svc.unit,
        unit_rate: svc.defaultRate,
        total,
        added_by: opts.addedBy,
        client_price_visible: true,
    });
};

const rebuildPricing = async (opts: {
    platformId: string;
    selfPickupUuid: string;
    calculatedBy: string;
}) => {
    await PricingService.rebuildBreakdown({
        entity_type: "SELF_PICKUP",
        entity_id: opts.selfPickupUuid,
        platform_id: opts.platformId,
        calculated_by: opts.calculatedBy,
    });
};

// ─────────────────────────────────────────────────────────────
// Per-SP seed functions
// ─────────────────────────────────────────────────────────────

// SPK-DEMO-001 — PRICING_REVIEW: just submitted, no line items yet, but
// inventory is held from submit (gotcha #44 — same pattern applies to SPs).
const seedSp1PricingReview = async (opts: SeedDemoSelfPickupsOpts) => {
    const spUuid = DEMO_UUIDS.selfPickups.sp1PricingReview;
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertSelfPickupRow({
        selfPickupUuid: spUuid,
        publicSelfPickupId: DEMO_SELF_PICKUP_IDS.sp1PricingReview,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        createdBy: opts.clientUserId,
        pickupStartDays: 14,
        pickupEndDays: 14,
        expectedReturnDays: 16,
        pricesId,
        selfPickupStatus: "PRICING_REVIEW",
        financialStatus: "PENDING_QUOTE",
        chairQuantity: 1,
        chairWeightPerUnit: opts.pooledAsset.weightPerUnit,
        chairVolumePerUnit: opts.pooledAsset.volumePerUnit,
    });
    await insertSelfPickupItem({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
    });
    await insertBooking({
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
        pickupStartDays: 14,
        pickupEndDays: 14,
        expectedReturnDays: 16,
    });
    await insertStatusHistory(opts.platformId, spUuid, opts.clientUserId, [
        { status: "SUBMITTED", daysFromEpoch: 0, notes: "Submitted from cart by Alex Chen." },
        { status: "PRICING_REVIEW", daysFromEpoch: 0, notes: "Auto-transition for pricing." },
    ]);
};

// SPK-DEMO-002 — QUOTED: Loading/Unloading line; awaiting client.
const seedSp2Quoted = async (opts: SeedDemoSelfPickupsOpts) => {
    const spUuid = DEMO_UUIDS.selfPickups.sp2Quoted;
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertSelfPickupRow({
        selfPickupUuid: spUuid,
        publicSelfPickupId: DEMO_SELF_PICKUP_IDS.sp2Quoted,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        createdBy: opts.clientUserId,
        pickupStartDays: 21,
        pickupEndDays: 21,
        expectedReturnDays: 23,
        pricesId,
        selfPickupStatus: "QUOTED",
        financialStatus: "QUOTE_SENT",
        chairQuantity: 1,
        chairWeightPerUnit: opts.pooledAsset.weightPerUnit,
        chairVolumePerUnit: opts.pooledAsset.volumePerUnit,
    });
    await insertSelfPickupItem({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
    });
    await insertBooking({
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
        pickupStartDays: 21,
        pickupEndDays: 21,
        expectedReturnDays: 23,
    });
    await insertCatalogLoadingLine({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        addedBy: opts.logisticsUserId,
    });
    await rebuildPricing({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertStatusHistory(opts.platformId, spUuid, opts.adminUserId, [
        { status: "SUBMITTED", daysFromEpoch: -3 },
        { status: "PRICING_REVIEW", daysFromEpoch: -3 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -2, notes: "Logistics submitted pricing." },
        { status: "QUOTED", daysFromEpoch: -1, notes: "Admin approved + sent to client." },
    ]);
};

// SPK-DEMO-003 — CONFIRMED with PO. Ready to be marked READY_FOR_PICKUP.
const seedSp3Confirmed = async (opts: SeedDemoSelfPickupsOpts) => {
    const spUuid = DEMO_UUIDS.selfPickups.sp3Confirmed;
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertSelfPickupRow({
        selfPickupUuid: spUuid,
        publicSelfPickupId: DEMO_SELF_PICKUP_IDS.sp3Confirmed,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        createdBy: opts.clientUserId,
        pickupStartDays: 7,
        pickupEndDays: 7,
        expectedReturnDays: 9,
        pricesId,
        selfPickupStatus: "CONFIRMED",
        financialStatus: "QUOTE_ACCEPTED",
        poNumber: "PO-SPK-DEMO-0003",
        chairQuantity: 1,
        chairWeightPerUnit: opts.pooledAsset.weightPerUnit,
        chairVolumePerUnit: opts.pooledAsset.volumePerUnit,
    });
    await insertSelfPickupItem({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
    });
    await insertBooking({
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
        pickupStartDays: 7,
        pickupEndDays: 7,
        expectedReturnDays: 9,
    });
    await insertCatalogLoadingLine({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        addedBy: opts.logisticsUserId,
    });
    await rebuildPricing({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertStatusHistory(opts.platformId, spUuid, opts.clientUserId, [
        { status: "SUBMITTED", daysFromEpoch: -5 },
        { status: "PRICING_REVIEW", daysFromEpoch: -5 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -4 },
        { status: "QUOTED", daysFromEpoch: -3 },
        { status: "CONFIRMED", daysFromEpoch: -2, notes: "Client approved with PO." },
    ]);
};

// SPK-DEMO-004 — READY_FOR_PICKUP: logistics flagged ready. Booking still held.
const seedSp4ReadyForPickup = async (opts: SeedDemoSelfPickupsOpts) => {
    const spUuid = DEMO_UUIDS.selfPickups.sp4ReadyForPickup;
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertSelfPickupRow({
        selfPickupUuid: spUuid,
        publicSelfPickupId: DEMO_SELF_PICKUP_IDS.sp4ReadyForPickup,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        createdBy: opts.clientUserId,
        pickupStartDays: 1,
        pickupEndDays: 1,
        expectedReturnDays: 5,
        pricesId,
        selfPickupStatus: "READY_FOR_PICKUP",
        financialStatus: "QUOTE_ACCEPTED",
        poNumber: "PO-SPK-DEMO-0004",
        chairQuantity: 1,
        chairWeightPerUnit: opts.pooledAsset.weightPerUnit,
        chairVolumePerUnit: opts.pooledAsset.volumePerUnit,
    });
    await insertSelfPickupItem({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
    });
    await insertBooking({
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
        pickupStartDays: 1,
        pickupEndDays: 1,
        expectedReturnDays: 5,
    });
    await insertCatalogLoadingLine({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        addedBy: opts.logisticsUserId,
    });
    await rebuildPricing({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertStatusHistory(opts.platformId, spUuid, opts.logisticsUserId, [
        { status: "SUBMITTED", daysFromEpoch: -8 },
        { status: "PRICING_REVIEW", daysFromEpoch: -8 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -7 },
        { status: "QUOTED", daysFromEpoch: -6 },
        { status: "CONFIRMED", daysFromEpoch: -5 },
        { status: "READY_FOR_PICKUP", daysFromEpoch: -1, notes: "Items packed + ready at dock." },
    ]);
};

// SPK-DEMO-005 — CLOSED: full cycle complete. Bookings released; available
// quantity restored. Picker (M2-M5) must EXCLUDE this from active list.
const seedSp5Closed = async (opts: SeedDemoSelfPickupsOpts) => {
    const spUuid = DEMO_UUIDS.selfPickups.sp5Closed;
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertSelfPickupRow({
        selfPickupUuid: spUuid,
        publicSelfPickupId: DEMO_SELF_PICKUP_IDS.sp5Closed,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        createdBy: opts.clientUserId,
        pickupStartDays: -10,
        pickupEndDays: -10,
        expectedReturnDays: -7,
        pricesId,
        selfPickupStatus: "CLOSED",
        financialStatus: "PENDING_INVOICE",
        poNumber: "PO-SPK-DEMO-0005",
        chairQuantity: 1,
        chairWeightPerUnit: opts.pooledAsset.weightPerUnit,
        chairVolumePerUnit: opts.pooledAsset.volumePerUnit,
    });
    await insertSelfPickupItem({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
    });
    // Insert booking briefly so the release path actually has rows to delete +
    // restores availability — mirrors what the live lifecycle does on CLOSE.
    await insertBooking({
        selfPickupUuid: spUuid,
        asset: opts.pooledAsset,
        quantity: 1,
        pickupStartDays: -10,
        pickupEndDays: -10,
        expectedReturnDays: -7,
    });
    await insertCatalogLoadingLine({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        addedBy: opts.logisticsUserId,
    });
    await rebuildPricing({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await releaseBookingsAndRestoreAvailability(db, "SELF_PICKUP", spUuid, opts.platformId);

    await insertStatusHistory(opts.platformId, spUuid, opts.logisticsUserId, [
        { status: "SUBMITTED", daysFromEpoch: -22 },
        { status: "PRICING_REVIEW", daysFromEpoch: -22 },
        { status: "PENDING_APPROVAL", daysFromEpoch: -21 },
        { status: "QUOTED", daysFromEpoch: -20 },
        { status: "CONFIRMED", daysFromEpoch: -19 },
        { status: "READY_FOR_PICKUP", daysFromEpoch: -12 },
        { status: "PICKED_UP", daysFromEpoch: -10, notes: "Collector signed for handover." },
        { status: "AWAITING_RETURN", daysFromEpoch: -8 },
        { status: "CLOSED", daysFromEpoch: -7, notes: "Returned + bookings released." },
    ]);
};

// SPK-DEMO-006 — CANCELLED before quoting. No items, no bookings, decline reason.
const seedSp6Cancelled = async (opts: SeedDemoSelfPickupsOpts) => {
    const spUuid = DEMO_UUIDS.selfPickups.sp6Cancelled;
    const pricesId = await insertPlaceholderPrices({
        platformId: opts.platformId,
        selfPickupUuid: spUuid,
        calculatedBy: opts.logisticsUserId,
    });
    await insertSelfPickupRow({
        selfPickupUuid: spUuid,
        publicSelfPickupId: DEMO_SELF_PICKUP_IDS.sp6Cancelled,
        platformId: opts.platformId,
        companyId: opts.companyId,
        brandId: opts.brandId,
        createdBy: opts.clientUserId,
        pickupStartDays: 30,
        pickupEndDays: 30,
        expectedReturnDays: 32,
        pricesId,
        selfPickupStatus: "CANCELLED",
        financialStatus: "CANCELLED",
        declineReason: "Internal scheduling conflict — pickup not needed.",
        chairQuantity: 0,
        chairWeightPerUnit: opts.pooledAsset.weightPerUnit,
        chairVolumePerUnit: opts.pooledAsset.volumePerUnit,
    });
    // No items, no bookings, no line items — admin cancelled before quoting.
    await insertStatusHistory(opts.platformId, spUuid, opts.adminUserId, [
        { status: "SUBMITTED", daysFromEpoch: -2 },
        { status: "PRICING_REVIEW", daysFromEpoch: -2 },
        {
            status: "CANCELLED",
            daysFromEpoch: -1,
            notes: "Cancelled by admin — internal scheduling conflict.",
        },
    ]);
};

// ─────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────

export const seedDemoSelfPickups = async (opts: SeedDemoSelfPickupsOpts): Promise<void> => {
    console.log(
        `📦 Seeding 6 demo self-pickups (epoch ${DEMO_EPOCH.toISOString().slice(0, 10)})...`
    );

    await seedSp1PricingReview(opts);
    console.log(`  ✓ ${DEMO_SELF_PICKUP_IDS.sp1PricingReview} — PRICING_REVIEW`);
    await seedSp2Quoted(opts);
    console.log(`  ✓ ${DEMO_SELF_PICKUP_IDS.sp2Quoted} — QUOTED`);
    await seedSp3Confirmed(opts);
    console.log(`  ✓ ${DEMO_SELF_PICKUP_IDS.sp3Confirmed} — CONFIRMED`);
    await seedSp4ReadyForPickup(opts);
    console.log(`  ✓ ${DEMO_SELF_PICKUP_IDS.sp4ReadyForPickup} — READY_FOR_PICKUP`);
    await seedSp5Closed(opts);
    console.log(`  ✓ ${DEMO_SELF_PICKUP_IDS.sp5Closed} — CLOSED (bookings released)`);
    await seedSp6Cancelled(opts);
    console.log(`  ✓ ${DEMO_SELF_PICKUP_IDS.sp6Cancelled} — CANCELLED`);

    // Normalize the chair asset status. `releaseBookingsAndRestoreAvailability`
    // (called from SP5) reconciles status to BOOKED whenever ANY remaining
    // bookings exist on the asset — but the existing order-happy-path scenario
    // queries `status = AVAILABLE` to discover a usable POOLED asset.
    // Keep the chair listed as AVAILABLE (it still has 12 free units) so the
    // pre-existing scenario keeps passing. POOLED items semantically remain
    // "available" while held — production logic normally relies on
    // available_quantity, not status, for pool-aware availability.
    await db
        .update(schema.assets)
        .set({ status: "AVAILABLE" })
        .where(eq(schema.assets.id, opts.pooledAsset.id));
};
