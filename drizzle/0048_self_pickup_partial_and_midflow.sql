-- Migration 0048 — self-pickup partial handover + mid-flow item additions.
--
-- Adds columns to self_pickup_items supporting two new NO_COST-gated flows:
--   1) Partial handover / skip: when the client only collects some of the
--      requested qty (or skips items entirely), the actual scanned quantity
--      is captured on each row so downstream (return, pricing, ledger)
--      respects what was actually collected — not what was originally
--      quoted.
--   2) Mid-flow item addition: when the client asks for extra at pickup
--      time (e.g. "throw in one more stool"), a new self_pickup_items row
--      is inserted with added_midflow=true so the UI + auditors can
--      distinguish original-quoted items from post-confirmation additions.
--
-- Both flows today are gated at the service layer to pricing_mode='NO_COST'
-- pickups only. STANDARD pricing_mode will be supported later behind a
-- separate feature flag once billing rules are settled.
--
-- All changes are strictly additive and back-compat: nullable columns with
-- sensible defaults, plus a one-shot backfill of terminal-state pickups so
-- the return flow sees an explicit scanned_quantity on records that were
-- created before this migration.
--
-- Idempotent. Safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: additive columns on self_pickup_items
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE self_pickup_items
    ADD COLUMN IF NOT EXISTS scanned_quantity INTEGER NULL,
    ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS partial_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS added_midflow BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS added_midflow_reason TEXT NULL,
    ADD COLUMN IF NOT EXISTS added_midflow_by UUID NULL REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS added_midflow_at TIMESTAMP NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: backfill terminal-state pickups so the return flow sees an
-- explicit scanned_quantity for records created before this migration. New
-- pickups created after this ship will have scanned_quantity set at
-- handover-completion time.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE self_pickup_items spi
SET scanned_quantity = spi.quantity
FROM self_pickups sp
WHERE sp.id = spi.self_pickup_id
  AND spi.scanned_quantity IS NULL
  AND sp.self_pickup_status IN ('PICKED_UP', 'AWAITING_RETURN', 'CLOSED');

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage C: helpful index for "show me midflow-added items on this SP"
-- lookups that the admin + client item lists will want.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS self_pickup_items_midflow_idx
    ON self_pickup_items(self_pickup_id, added_midflow);
