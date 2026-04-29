-- Migration 0053 — backfill historical WRITE_OFF rows + assets invariant.
--
-- Two operations:
--
-- 1) Reclassify historical stock_movements rows that were ad-hoc removals
--    (operator walked off with a unit, no live booking) but got recorded as
--    WRITE_OFF because the manual dialog forced that label. The signal that
--    tells us they were ad-hoc: linked_entity_id IS NULL. Settlement
--    WRITE_OFFs are fired by the inbound-scan flow which always sets
--    linked_entity_id, so any unlinked WRITE_OFF in the historical record
--    is a manual ad-hoc.
--
--    This is a label correction only — the underlying delta is unchanged,
--    and the math impact is captured in the new dialog/service going
--    forward (OUTBOUND_AD_HOC decrements both qty fields, WRITE_OFF
--    decrements total only). Past rows are static history; we're just
--    giving them the right enum label so reports/audit reflect intent.
--
-- 2) Defensive CHECK constraint on assets.available_quantity <=
--    total_quantity. Per audit, all current write paths maintain this
--    invariant at all times — the constraint will never trip under normal
--    operation. Lands as a permanent backstop so future code or future
--    operator behaviour can't corrupt the invariant again.
--
--    Pre-flight: the data agent already clamped 3 prod rows that violated
--    this constraint (360 Medium Cooler, V3 CANVAS, WIGWAM TENT) on
--    2026-04-29. Migration 0053 will fail loudly if any new violators
--    surface — pre-deploy SQL scan recommended:
--      SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL
--        AND available_quantity > total_quantity;
--    Expect 0.
--
-- Both operations are wrapped in DO-blocks for re-runnability:
--   - The UPDATE has no IF guard (it's idempotent on the type filter — a row
--     already in OUTBOUND_AD_HOC won't match the WHERE).
--   - The constraint addition uses pg_constraint lookup.

UPDATE "stock_movements"
SET "movement_type" = 'OUTBOUND_AD_HOC'
WHERE "movement_type" = 'WRITE_OFF'
  AND "linked_entity_id" IS NULL;

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
