-- Migration 0069 — seed the ORPHAN_BOOKINGS_DETECTED → ADMIN notification rule.
--
-- Phase 5 of the reports alignment. The two occupancy reports (current-stock,
-- asset-utilization) now trust asset_bookings by EXISTENCE — a row exists IFF
-- the hold is active, since release hard-deletes it in the same txn as the
-- terminal status flip. They dropped the parent-status joins that used to
-- (silently) filter out orphans. The daily `checkOrphanBookings` cron is the
-- safety net that replaced those joins: it emits ORPHAN_BOOKINGS_DETECTED when
-- a booking row references a closed/cancelled/deleted parent. This migration
-- routes that event to the ADMIN role.
--
-- Scope: platform-level (company_id IS NULL), seeded for EVERY platform, so a
-- new platform created later still needs the rule (re-run this migration is a
-- no-op for already-seeded platforms via the NOT EXISTS guard). Recipient is
-- ADMIN ONLY — booking-engine integrity is an internal/ops concern, never
-- surfaced to LOGISTICS or CLIENT.
--
-- Idempotent: INSERT … SELECT with NOT EXISTS; does not modify existing rows.
-- Safe for production — additive only.

INSERT INTO notification_rules (
    platform_id,
    event_type,
    company_id,
    recipient_type,
    recipient_value,
    template_key,
    conditions,
    is_enabled,
    sort_order,
    created_at,
    updated_at
)
SELECT
    p.id,
    'booking.orphans_detected',
    NULL,
    'ROLE'::recipient_type,
    'ADMIN',
    'orphan_bookings_detected_admin',
    '[]'::jsonb,
    true,
    0,
    NOW(),
    NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1
    FROM notification_rules nr
    WHERE nr.platform_id = p.id
      AND nr.event_type = 'booking.orphans_detected'
      AND nr.company_id IS NULL
      AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN'
      AND nr.template_key = 'orphan_bookings_detected_admin'
);
