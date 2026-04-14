/**
 * Demo service request — one MAINTENANCE SR linked to Order 5 (CLOSED).
 *
 * Why Order 5: its inbound scan flagged a backdrop with a cracked frame —
 * realistic provenance for a follow-up SR. The request is in commercial_status
 * QUOTED with line-item pricing so the docs UI shows a real service-request
 * detail page (not an empty stub).
 *
 * `request_status` lives in the operational dual-status model — for "client
 * has been quoted but hasn't approved yet," `request_status=APPROVED` (admin
 * approved the request operationally) + `commercial_status=QUOTED` is the
 * real production combination. See schema.ts:158-175 for the enum split.
 */

import { db } from "../index";
import { lineItemIdGenerator } from "../../app/modules/order-line-items/order-line-items.utils";
import { PricingService } from "../../app/services/pricing.service";
import * as schema from "../schema";
import { DEMO_UUIDS, daysFromEpoch } from "./demo-deterministic";

export type SeedDemoServiceRequestOpts = {
    platformId: string;
    companyId: string;
    adminUserId: string;
    logisticsUserId: string;
};

export const seedDemoServiceRequest = async (opts: SeedDemoServiceRequestOpts): Promise<void> => {
    console.log("🛠️  Seeding demo service request linked to Order 5...");

    const srUuid = DEMO_UUIDS.serviceRequest;

    // Placeholder prices row; rebuildBreakdown updates it after line items.
    const [pricesRow] = await db
        .insert(schema.prices)
        .values({
            platform_id: opts.platformId,
            entity_type: "SERVICE_REQUEST",
            entity_id: srUuid,
            breakdown_lines: [],
            margin_percent: "25.00",
            vat_percent: "0.00",
            calculated_by: opts.logisticsUserId,
        })
        .returning({ id: schema.prices.id });

    await db.insert(schema.serviceRequests).values({
        id: srUuid,
        service_request_id: "SR-DEMO-001",
        platform_id: opts.platformId,
        company_id: opts.companyId,
        request_type: "MAINTENANCE",
        billing_mode: "CLIENT_BILLABLE",
        link_mode: "BUNDLED_WITH_ORDER",
        blocks_fulfillment: false,
        request_status: "APPROVED",
        commercial_status: "QUOTED",
        title: "Backdrop frame repair (Order ORD-DEMO-005)",
        description:
            "Cracked frame discovered on inbound return. Refurbishment needed before next event.",
        related_asset_id: DEMO_UUIDS.assets.backdropGreen1,
        related_order_id: DEMO_UUIDS.orders.order5Closed,
        request_pricing_id: pricesRow.id,
        requested_start_at: daysFromEpoch(-6),
        requested_due_at: daysFromEpoch(0),
        created_by: opts.adminUserId,
        photos: [
            "https://placehold.co/512x512/dc2626/FFFFFF?text=Frame+Damage",
            "https://placehold.co/512x512/991b1b/FFFFFF?text=Closeup",
        ],
    });

    await db.insert(schema.serviceRequestItems).values({
        service_request_id: srUuid,
        asset_id: DEMO_UUIDS.assets.backdropGreen1,
        asset_name: "Backdrop Panel #1",
        quantity: 1,
        notes: "Aluminum frame replacement",
        refurb_days_estimate: 5,
    });

    // Pricing: one CATALOG line for refurbishment work.
    const lineId = await lineItemIdGenerator(opts.platformId);
    await db.insert(schema.lineItems).values({
        line_item_id: lineId,
        platform_id: opts.platformId,
        service_request_id: srUuid,
        purpose_type: "SERVICE_REQUEST",
        line_item_type: "CUSTOM",
        billing_mode: "BILLABLE",
        category: "OTHER",
        description: "Backdrop frame refurbishment (parts + labor)",
        quantity: "1",
        unit: "unit",
        unit_rate: "350.00",
        total: "350.00",
        added_by: opts.logisticsUserId,
        client_price_visible: true,
    });

    // Sync prices row + base ops via the real pricing service (same path
    // production uses) so the SR's prices row matches what the UI expects.
    await PricingService.rebuildBreakdown({
        entity_type: "SERVICE_REQUEST",
        entity_id: srUuid,
        platform_id: opts.platformId,
        calculated_by: opts.logisticsUserId,
    });

    await db.insert(schema.serviceRequestStatusHistory).values([
        {
            service_request_id: srUuid,
            platform_id: opts.platformId,
            from_status: null,
            to_status: "DRAFT",
            note: "Created from inbound scan damage flag.",
            changed_by: opts.adminUserId,
        },
        {
            service_request_id: srUuid,
            platform_id: opts.platformId,
            from_status: "DRAFT",
            to_status: "SUBMITTED",
            note: "Logistics submitted for review.",
            changed_by: opts.logisticsUserId,
        },
        {
            service_request_id: srUuid,
            platform_id: opts.platformId,
            from_status: "SUBMITTED",
            to_status: "APPROVED",
            note: "Admin approved — pricing sent to client.",
            changed_by: opts.adminUserId,
        },
    ]);

    console.log("  ✓ SR-DEMO-001 (MAINTENANCE / APPROVED+QUOTED) linked to ORD-DEMO-005");
};
