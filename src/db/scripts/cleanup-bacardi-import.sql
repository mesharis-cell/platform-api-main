-- cleanup-bacardi-import.sql
--
-- Wipes everything Phase 0 + Phase B + Phase C of seed-bacardi-assets.ts created.
-- Strictly scoped to the Bacardi company UUID + the named warehouse / zone /
-- categories. Safe to re-run on a partially- or fully-imported database.
--
-- USAGE:
--   set -a && source api/.env.dbops && set +a
--   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f api/src/db/scripts/cleanup-bacardi-import.sql
--   psql "$PROD_DATABASE_URL"    -v ON_ERROR_STOP=1 -f api/src/db/scripts/cleanup-bacardi-import.sql
--
-- After: re-run --phase=setup and onwards from a clean slate.

BEGIN;

-- Phase C/B reverse: assets → families → brands (FK order matters)
DELETE FROM public.assets         WHERE company_id = '8da36306-052b-4e98-84e9-6ab09acdbb69';
DELETE FROM public.asset_families WHERE company_id = '8da36306-052b-4e98-84e9-6ab09acdbb69';
DELETE FROM public.brands         WHERE company    = '8da36306-052b-4e98-84e9-6ab09acdbb69';

-- Phase 0 reverse: zone (Bacardi-scoped, under UAQ-C only)
DELETE FROM public.zones
WHERE company   = '8da36306-052b-4e98-84e9-6ab09acdbb69'
  AND name      = 'N/A'
  AND warehouse IN (
    SELECT id FROM public.warehouses
    WHERE platform = '852e6d14-cd3e-4a78-893b-b6ea7c91dead'
      AND name     = 'UAQ - C'
  );

-- Phase 0 reverse: warehouse (only if no zones still reference it)
DELETE FROM public.warehouses
WHERE platform = '852e6d14-cd3e-4a78-893b-b6ea7c91dead'
  AND name     = 'UAQ - C'
  AND NOT EXISTS (
    SELECT 1 FROM public.zones z WHERE z.warehouse = warehouses.id
  );

-- NOTE: asset_categories are intentionally NOT deleted here.
-- They're platform-wide vocabulary (reusable by any tenant), additive only.
-- Any orphaned category created by a previous Bacardi run can be removed
-- manually if desired:
--   DELETE FROM public.asset_categories
--   WHERE platform_id = '852e6d14-cd3e-4a78-893b-b6ea7c91dead'
--     AND company_id IS NULL
--     AND name = '<exact name>'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.asset_families af WHERE af.category_id = asset_categories.id
--     );

COMMIT;
