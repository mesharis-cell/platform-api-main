/**
 * Shared seed module: platform-default notification rules.
 *
 * Single source of truth for the platform-default rules. Every rule is
 * platform-scoped (company_id = null) and enabled by default. Company-
 * specific overrides are seeded per-tenant outside this module.
 *
 * Canonical set matches `seed.ts` — which is the most complete of the
 * existing seeds. `seed-pr.ts` is an older/stripped subset missing events
 * like quote.approved; that gap surfaced during the first E2E run (the
 * quote.approved rules were absent so no notification_logs rows were
 * written). This module is what testing depends on, so keep it complete.
 *
 * Consumers: src/db/seed-test.ts
 * Future consumers: seed.ts, seed-pr.ts, seed-demo-pr.ts (refactor task).
 */

import { db } from "../index";
import * as schema from "../schema";

type NotificationRuleDef = {
    event_type: string;
    recipient_type: "ROLE" | "ENTITY_OWNER" | "EMAIL";
    recipient_value: string | null;
    template_key: string;
    sort_order: number;
};

export const PLATFORM_DEFAULT_NOTIFICATION_RULES: NotificationRuleDef[] = [
    // order.submitted
    {
        event_type: "order.submitted",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "order_submitted_client",
        sort_order: 0,
    },
    {
        event_type: "order.submitted",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_submitted_admin",
        sort_order: 1,
    },
    {
        event_type: "order.submitted",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "order_submitted_logistics",
        sort_order: 2,
    },

    // order.pending_approval
    {
        event_type: "order.pending_approval",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_pending_approval_admin",
        sort_order: 0,
    },

    // quote.sent / quote.revised / quote.approved / quote.declined
    {
        event_type: "quote.sent",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "quote_sent_client",
        sort_order: 0,
    },
    {
        event_type: "quote.sent",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "quote_sent_admin",
        sort_order: 1,
    },
    {
        event_type: "quote.revised",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "quote_revised_client",
        sort_order: 0,
    },
    {
        event_type: "quote.revised",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "quote_revised_admin",
        sort_order: 1,
    },
    {
        event_type: "quote.approved",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "quote_approved_admin",
        sort_order: 0,
    },
    {
        event_type: "quote.approved",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "quote_approved_logistics",
        sort_order: 1,
    },
    {
        event_type: "quote.declined",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "quote_declined_admin",
        sort_order: 0,
    },
    {
        event_type: "quote.declined",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "quote_declined_logistics",
        sort_order: 1,
    },

    // order lifecycle
    {
        event_type: "order.confirmed",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "order_confirmed_client",
        sort_order: 0,
    },
    {
        event_type: "order.confirmed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_confirmed_admin",
        sort_order: 1,
    },
    {
        event_type: "order.confirmed",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "order_confirmed_logistics",
        sort_order: 2,
    },
    {
        event_type: "order.ready_for_delivery",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_ready_admin",
        sort_order: 0,
    },
    {
        event_type: "order.in_transit",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "order_in_transit_client",
        sort_order: 0,
    },
    {
        event_type: "order.in_transit",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_in_transit_admin",
        sort_order: 1,
    },
    {
        event_type: "order.delivered",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "order_delivered_client",
        sort_order: 0,
    },
    {
        event_type: "order.delivered",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_delivered_admin",
        sort_order: 1,
    },
    {
        event_type: "order.delivered",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "order_delivered_logistics",
        sort_order: 2,
    },
    {
        event_type: "order.pickup_reminder",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "pickup_reminder_client",
        sort_order: 0,
    },
    {
        event_type: "order.pickup_reminder",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "pickup_reminder_admin",
        sort_order: 1,
    },
    {
        event_type: "order.pickup_reminder",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "pickup_reminder_logistics",
        sort_order: 2,
    },
    {
        event_type: "order.closed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_closed_admin",
        sort_order: 0,
    },
    {
        event_type: "order.cancelled",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "order_cancelled_client",
        sort_order: 0,
    },
    {
        event_type: "order.cancelled",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "order_cancelled_admin",
        sort_order: 1,
    },
    {
        event_type: "order.cancelled",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "order_cancelled_logistics",
        sort_order: 2,
    },
    {
        event_type: "order.time_windows_updated",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "time_windows_updated_client",
        sort_order: 0,
    },
    {
        event_type: "order.time_windows_updated",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "time_windows_updated_admin",
        sort_order: 1,
    },

    // invoicing / payment / fabrication (events defined, emitters TBD)
    {
        event_type: "invoice.generated",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "invoice_generated_client",
        sort_order: 0,
    },
    {
        event_type: "invoice.generated",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "invoice_generated_admin",
        sort_order: 1,
    },
    {
        event_type: "payment.confirmed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "payment_confirmed_admin",
        sort_order: 0,
    },
    {
        event_type: "payment.confirmed",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "payment_confirmed_logistics",
        sort_order: 1,
    },
    {
        event_type: "fabrication.completed",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "fabrication_completed_logistics",
        sort_order: 0,
    },
    {
        event_type: "fabrication.completed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "fabrication_completed_admin",
        sort_order: 1,
    },

    // inbound_request
    {
        event_type: "inbound_request.submitted",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "ir_submitted_client",
        sort_order: 0,
    },
    {
        event_type: "inbound_request.submitted",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "ir_submitted_admin",
        sort_order: 1,
    },
    {
        event_type: "inbound_request.submitted",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "ir_submitted_logistics",
        sort_order: 2,
    },
    {
        event_type: "inbound_request.quoted",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "ir_quoted_client",
        sort_order: 0,
    },
    {
        event_type: "inbound_request.approved",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "ir_approved_admin",
        sort_order: 0,
    },
    {
        event_type: "inbound_request.approved",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "ir_approved_logistics",
        sort_order: 1,
    },
    {
        event_type: "inbound_request.completed",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "ir_completed_client",
        sort_order: 0,
    },
    {
        event_type: "inbound_request.invoice_generated",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "ir_invoice_client",
        sort_order: 0,
    },
    {
        event_type: "inbound_request.invoice_generated",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "ir_invoice_admin",
        sort_order: 1,
    },

    // service_request
    {
        event_type: "service_request.submitted",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "sr_submitted_admin",
        sort_order: 0,
    },
    {
        event_type: "service_request.submitted",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "sr_submitted_logistics",
        sort_order: 1,
    },
    {
        event_type: "service_request.quoted",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "sr_quoted_client",
        sort_order: 0,
    },
    {
        event_type: "service_request.quote_revised",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "sr_quote_revised_client",
        sort_order: 0,
    },
    {
        event_type: "service_request.approved",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "sr_approved_admin",
        sort_order: 0,
    },
    {
        event_type: "service_request.completed",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "sr_completed_client",
        sort_order: 0,
    },
    {
        event_type: "service_request.completed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "sr_completed_admin",
        sort_order: 1,
    },
    {
        event_type: "service_request.invoice_generated",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "sr_invoice_client",
        sort_order: 0,
    },
    {
        event_type: "service_request.invoice_generated",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "sr_invoice_admin",
        sort_order: 1,
    },

    // workflow_request
    {
        event_type: "workflow_request.submitted",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "workflow_request_submitted_admin",
        sort_order: 0,
    },
    {
        event_type: "workflow_request.submitted",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "workflow_request_submitted_logistics",
        sort_order: 1,
    },
    {
        event_type: "workflow_request.status_changed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "workflow_request_status_changed_admin",
        sort_order: 0,
    },
    {
        event_type: "workflow_request.status_changed",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "workflow_request_status_changed_logistics",
        sort_order: 1,
    },
    {
        event_type: "workflow_request.completed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "workflow_request_completed_admin",
        sort_order: 0,
    },
    {
        event_type: "workflow_request.completed",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "workflow_request_completed_logistics",
        sort_order: 1,
    },
    {
        event_type: "workflow_request.cancelled",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "workflow_request_cancelled_admin",
        sort_order: 0,
    },
    {
        event_type: "workflow_request.cancelled",
        recipient_type: "ROLE",
        recipient_value: "LOGISTICS",
        template_key: "workflow_request_cancelled_logistics",
        sort_order: 1,
    },

    // self_booking
    {
        event_type: "self_booking.created",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "self_booking_created_admin",
        sort_order: 0,
    },
    {
        event_type: "self_booking.completed",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "self_booking_completed_admin",
        sort_order: 0,
    },
    {
        event_type: "self_booking.cancelled",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "self_booking_cancelled_admin",
        sort_order: 0,
    },

    // auth + line_item_request
    {
        event_type: "auth.password_reset_requested",
        recipient_type: "ENTITY_OWNER",
        recipient_value: null,
        template_key: "password_reset_otp",
        sort_order: 0,
    },
    {
        event_type: "line_item_request.submitted",
        recipient_type: "ROLE",
        recipient_value: "ADMIN",
        template_key: "line_item_request_submitted_admin",
        sort_order: 0,
    },
];

export type SeedNotificationRulesOpts = {
    platformId: string;
};

export const seedNotificationRules = async (opts: SeedNotificationRulesOpts) => {
    const rows = PLATFORM_DEFAULT_NOTIFICATION_RULES.map((r) => ({
        platform_id: opts.platformId,
        company_id: null,
        is_enabled: true,
        ...r,
    }));
    return db.insert(schema.notificationRules).values(rows).returning();
};
