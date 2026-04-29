-- Migration 0053 — assets invariant: available_quantity <= total_quantity.
--
-- Defensive CHECK constraint as a permanent backstop. Per audit, all current
-- write paths maintain this invariant at all times — the constraint will
-- never trip under normal operation. Lands so that future code or future
-- operator behaviour can't corrupt the invariant again.
--
-- Pre-flight: the data agent already clamped 3 prod rows that violated this
-- constraint (360 Medium Cooler, V3 CANVAS, WIGWAM TENT) on 2026-04-29.
-- Migration will fail loudly if any new violators surface — pre-deploy SQL
-- scan recommended:
--   SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL
--     AND available_quantity > total_quantity;
-- Expect 0.
--
-- Note: the relabel of historical WRITE_OFF rows (linked_entity_id IS NULL
-- → OUTBOUND_AD_HOC) was originally planned to live here too, but PostgreSQL
-- forbids using a new enum value in the same transaction that ADDED it
-- (error 55P04 "unsafe use of new value"). Drizzle's migrator wraps all
-- pending migrations in a single tx, so we move the relabel to the
-- standalone backfill script `backfill-outbound-ad-hoc-movements.ts`. Run:
--   APP_ENV=staging bun run stock-movements:backfill:apply
-- after migration 0052 has committed.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'assets_available_le_total'
    ) THEN
        ALTER TABLE "assets"
            ADD CONSTRAINT "assets_available_le_total"
            CHECK ("available_quantity" <= "total_quantity");
    END IF;
END $$;
