-- Migration: 0056_warehouse_company_timings
--
-- Adds per-warehouse operating hours and lead-time override storage to
-- support item 2 of the 9-item bundle. The resolver order is:
--   company.settings.feasibility.<field>
--     -> warehouse.config.<field>
--     -> platform.config.feasibility.<field>
--     -> hardcoded default
--
-- Also adds self_pickups.warehouse_id (nullable) so feasibility resolution
-- can be per-warehouse for self-pickups. Backfill is left for a follow-up
-- migration once an authoritative warehouse derivation is in place; the
-- column stays nullable until then.
--
-- Stages:
--   1. Add warehouses.operating_hours jsonb (null = "no schedule, treated
--      as always open"). Shape: {mon:[6,18], tue:[6,18], ..., sun:null}
--   2. Add warehouses.config jsonb (default '{}'). Mirrors the
--      platforms.config.feasibility shape for per-warehouse overrides:
--      {minimum_lead_hours, sp_minimum_lead_hours, ooh_pickup_minimum_lead_hours}
--   3. Add self_pickups.warehouse_id uuid (nullable, FK -> warehouses.id)
--      with an index for lookups.

ALTER TABLE "warehouses"
  ADD COLUMN IF NOT EXISTS "operating_hours" jsonb;

ALTER TABLE "warehouses"
  ADD COLUMN IF NOT EXISTS "config" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "self_pickups"
  ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'self_pickups'
          AND constraint_name = 'self_pickups_warehouse_id_fkey'
    ) THEN
        ALTER TABLE "self_pickups"
          ADD CONSTRAINT "self_pickups_warehouse_id_fkey"
          FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "self_pickups_warehouse_id_idx"
  ON "self_pickups" ("warehouse_id");
