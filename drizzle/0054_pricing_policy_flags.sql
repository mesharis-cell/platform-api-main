-- Migration 0054 — per-line pricing policy flags.
--
-- Adds two layered policy controls that compose with the existing
-- CATALOG / CUSTOM / SYSTEM line_item_type model:
--
--   1. service_types.apply_margin    (default true)
--      "Lines added from this service type apply the entity margin %
--       by default." Flip to false on types whose buy = sell by
--       agreement (e.g. most transport types). Per-line override is
--       allowed via line_items.apply_margin.
--
--   2. line_items.apply_margin       (nullable)
--      Per-line override. NULL = inherit from service_type (or true
--      when no service_type — CUSTOM lines treat NULL as true).
--      When false: sell_total = buy_total, sell_unit_price =
--      buy_unit_price (no margin markup), per pricing.service.ts.
--
--   3. line_items.logistics_visible  (default true)
--      Per-line audience flag. When false the line is stripped from
--      LOGISTICS role projections entirely (both display rows AND
--      totals). CLIENT projection is unaffected — clients still see
--      the line subject to client_price_visible. ADMIN sees everything.
--
-- Defaults preserve current behaviour: every existing line gets
-- apply_margin=NULL (inherit, resolves to true via service_type default
-- of true) and logistics_visible=true. Zero behavioural change at
-- migration time; the snapshot moves only on the next rebuildBreakdown.
--
-- Backwards compatibility: no consumer reads these columns yet.
-- Safe to apply ahead of the API deploy.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'service_types' AND column_name = 'apply_margin'
    ) THEN
        ALTER TABLE "service_types"
            ADD COLUMN "apply_margin" boolean NOT NULL DEFAULT true;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'line_items' AND column_name = 'apply_margin'
    ) THEN
        ALTER TABLE "line_items"
            ADD COLUMN "apply_margin" boolean;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'line_items' AND column_name = 'logistics_visible'
    ) THEN
        ALTER TABLE "line_items"
            ADD COLUMN "logistics_visible" boolean NOT NULL DEFAULT true;
    END IF;
END $$;
