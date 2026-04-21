-- Migration 0046 — self-pickup line items: unique constraint + backfill cleanup.
--
-- Two related fixes landing together:
--
-- (A) Adds the partial unique index that was missing for self-pickup SYSTEM
--     line items. The other three entity types already had this index
--     (line_items_order_system_key_unique / _inbound_ / _service_request_);
--     self_pickup was omitted. Without it, nothing at the DB level stopped
--     multiple BASE_OPS rows from being inserted for the same self-pickup,
--     which manifested as duplicate "Picking & Handling" charges on staging.
--
-- (B) Voids any duplicate BASE_OPS SYSTEM rows that may exist on a self-pickup
--     today (keeps the oldest non-voided row per pickup) so the unique index
--     can be created without conflict. Idempotent.
--
-- Pre-alpha: safe. Old orphan data on staging is expected.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: De-duplicate existing self-pickup SYSTEM rows.
-- Keep the oldest non-voided row per (platform, self_pickup, system_key);
-- mark the rest as voided so the unique index can land.
-- ═══════════════════════════════════════════════════════════════════════════

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY platform_id, self_pickup_id, system_key
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM line_items
    WHERE self_pickup_id IS NOT NULL
      AND system_key IS NOT NULL
      AND is_voided = false
)
UPDATE line_items
SET
    is_voided = true,
    voided_at = NOW(),
    void_reason = 'Duplicate SYSTEM line item — retired by migration 0046 (unique index backfill)',
    updated_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: Create the partial unique index for self-pickup SYSTEM lines.
-- Mirrors the three existing indexes for order / inbound / service_request.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "line_items_self_pickup_system_key_unique"
    ON "line_items" ("platform_id", "self_pickup_id", "system_key")
    WHERE "self_pickup_id" IS NOT NULL
      AND "system_key" IS NOT NULL
      AND "is_voided" = false;
