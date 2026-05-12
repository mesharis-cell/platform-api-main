-- Migration: 0059_permanent_placement_and_default_warehouse_hours
--
-- Two related concerns landing together to keep the staging-test friction
-- low while item 7 + item 2 are being smoke-tested:
--
--   A. Adds is_permanent_placement (boolean, default false) to orders
--      and self_pickups. The client checkout now collects an explicit
--      yes/no at the venue step — required, no default — so we know
--      whether the goods are going out permanently (no return shipment
--      expected) vs the normal rental flow. Existing rows default to
--      false (temporary placement = the historical assumption).
--
--   B. Backfills warehouses.operating_hours = Mon-Sat 06:00-18:00 for
--      every active warehouse that doesn't already have a schedule set.
--      Matches the warehouse policy Isaac stated in the May 7 email,
--      and lets the OOH self-pickup lead-time logic from migration
--      0056 be exercised without each tenant manually configuring
--      hours first. Tenants who want different hours just overwrite.

-- A. Permanent-placement column on orders + self_pickups
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "is_permanent_placement" boolean NOT NULL DEFAULT false;

ALTER TABLE "self_pickups"
  ADD COLUMN IF NOT EXISTS "is_permanent_placement" boolean NOT NULL DEFAULT false;

-- B. Default operating hours for warehouses that haven't been configured.
-- Mon-Sat 06:00-18:00, Sunday closed. Skips any warehouse where ops has
-- already set hours so we don't trample tenant config.
UPDATE "warehouses"
SET "operating_hours" = '{
    "mon": [6, 18],
    "tue": [6, 18],
    "wed": [6, 18],
    "thu": [6, 18],
    "fri": [6, 18],
    "sat": [6, 18],
    "sun": null
}'::jsonb
WHERE "operating_hours" IS NULL
  AND "is_active" = true;
