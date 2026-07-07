-- Migration: 0074_client_visible_and_notify_defaults
--
-- Purpose: Two owner-feedback changes (2026-07-07 pricing-ledger smoke round):
--          Stage A — add `line_items.client_visible` (whole-line CLIENT audience
--            flag). Distinct from `client_price_visible` (which hides only the
--            per-line PRICE). When false, the whole line is stripped from CLIENT
--            projections (display rows AND totals — symmetric with
--            logistics_visible). Backs owner feedback items 2/3/13.
--          Stage B — default the edit-notification rules OFF. The owner wants
--            `order.updated` + `self_pickup.updated` emails silent by default
--            (the ops dashboard can re-enable per platform/company; the in-app
--            changelog is unaffected). Backs owner feedback item 15.
--
-- Scope:   line_items (ADD COLUMN) + a data UPDATE on notification_rules for the
--          two `*.updated` event types. The seed source
--          (src/db/seeds/notification-rules.ts) is updated in the same PR so
--          fresh platforms get these rules disabled too.
--
-- Safety:  NON-DESTRUCTIVE. The new column defaults to TRUE — every existing
--          line stays client-visible (current behaviour). The notification
--          UPDATE only flips the two edit-notification event types to disabled;
--          re-enabling later is a normal dashboard toggle. FULLY IDEMPOTENT
--          (IF NOT EXISTS guard + a stable, re-runnable predicate).
--
-- Apply:   `APP_ENV=staging|production bunx drizzle-kit migrate` only
--          (hand-written; no drizzle-kit generate on this repo).

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: Add line_items.client_visible (whole-line CLIENT audience flag).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "line_items"
    ADD COLUMN IF NOT EXISTS "client_visible" boolean NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: Default the edit-notification rules OFF.
-- order.updated + self_pickup.updated notification rules ship enabled today.
-- The owner wants edit-emails silent by default; disable every matching rule
-- (all recipients). The dashboard can re-enable per platform/company later.
-- Idempotent: rules already disabled are unaffected.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "notification_rules"
SET "is_enabled" = false
WHERE "event_type" IN ('order.updated', 'self_pickup.updated')
  AND "is_enabled" = true;
