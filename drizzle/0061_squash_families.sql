-- Migration 0061 — Squash Asset Families
--
-- One-shot cutover: asset_families becomes a renamed read-only archive
-- (legacy_asset_families). Assets become self-contained — they own name,
-- category, brand, dimensions, weight, packaging, handling_tags, images
-- directly, plus group fields: group_id (opaque correlation key replacing
-- family_id), group_name (denormalized display label), group_images /
-- group_on_display_image (denormalized group presentation media), and
-- stock_mode (SERIALIZED|POOLED, replacing tracking_method).
--
-- See plan: ~/.claude/plans/dont-worry-about-dates-peppy-acorn.md
--
-- Stages (all in this single migration file):
--   A — ADD group_id, group_name, group media, stock_mode, low_stock_threshold on assets
--   B — BACKFILL from asset_families + commerce_rules JSON rewrite
--   C — VALIDATE backfill + SET NOT NULL on assets.stock_mode
--   D — RENAME asset_families → legacy_asset_families,
--       DROP assets.family_id + assets.tracking_method,
--       DROP FK on stock_movements.asset_family_id (column kept as plain uuid)
--
-- Reversibility:
--   Pre-Stage D: idempotent re-run; UPDATEs use COALESCE/IS NULL guards.
--   Post-Stage D: requires Supabase point-in-time restore. Take snapshot
--                 before applying on prod.
--
-- Inbound module: this migration breaks the inbound module (it still writes
-- family_id + reads tracking_method). Inbound is intentionally out of scope
-- per locked decision #24; a separate agent will fix it when the team needs
-- inbound again.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: ADD new columns to assets
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "group_id" uuid NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "group_name" varchar(200) NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "group_images" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "group_on_display_image" text NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "stock_mode" "stock_mode" NULL;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "low_stock_threshold" integer NULL;

CREATE INDEX IF NOT EXISTS "assets_group_id_idx" ON "assets" ("group_id");
CREATE INDEX IF NOT EXISTS "assets_stock_mode_idx" ON "assets" ("stock_mode");

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: BACKFILL from asset_families
-- ═══════════════════════════════════════════════════════════════════════════

-- group_id = family.id (preserves identity for historical joins to legacy table)
UPDATE "assets" SET group_id = family_id WHERE family_id IS NOT NULL;

-- group_name = family.name (denormalized onto every asset in the group)
UPDATE "assets" a
SET group_name = af.name
FROM "asset_families" af
WHERE a.family_id = af.id;

-- group presentation media comes from the old family-level curated media.
-- This preserves explicit catalog visuals without keeping asset_families as a
-- runtime table.
UPDATE "assets" a
SET
    group_images = COALESCE(af.images, '[]'::jsonb),
    group_on_display_image = af.on_display_image
FROM "asset_families" af
WHERE a.family_id = af.id;

-- stock_mode from family for grouped assets
UPDATE "assets" a
SET stock_mode = af.stock_mode
FROM "asset_families" af
WHERE a.family_id = af.id;

-- For raw assets (family_id IS NULL), derive stock_mode from tracking_method
UPDATE "assets" SET stock_mode = 'SERIALIZED'::"stock_mode"
WHERE stock_mode IS NULL AND tracking_method = 'INDIVIDUAL';

UPDATE "assets" SET stock_mode = 'POOLED'::"stock_mode"
WHERE stock_mode IS NULL AND tracking_method = 'BATCH';

-- low_stock_threshold from family for pooled assets only (NULL stays NULL —
-- threshold is opt-in and serialized thresholds are not exposed post-squash).
UPDATE "assets" a
SET low_stock_threshold = af.low_stock_threshold
FROM "asset_families" af
WHERE a.family_id = af.id
  AND af.low_stock_threshold IS NOT NULL
  AND af.stock_mode = 'POOLED'::"stock_mode";

-- Commerce rules are raw-asset-only post-squash. Existing family-targeted
-- rules cannot be mapped safely to thin presentation groups, so disable them
-- instead of silently changing booking behavior.
UPDATE "commerce_rules"
SET
    is_active = false,
    deleted_at = COALESCE(deleted_at, NOW()),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND (
      target->>'kind' = 'FAMILY'
      OR target->>'kind' = 'GROUP'
      OR (
          predicate->>'kind' = 'COMPANION_REQUIRED'
          AND predicate->'companion_target'->>'kind' IN ('FAMILY', 'GROUP')
      )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage C: VALIDATE backfill + ENFORCE stock_mode NOT NULL
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    missing_stock_mode INT;
    missing_group_id_with_family INT;
    missing_group_name_with_group_id INT;
BEGIN
    SELECT COUNT(*) INTO missing_stock_mode
    FROM "assets" WHERE deleted_at IS NULL AND stock_mode IS NULL;

    SELECT COUNT(*) INTO missing_group_id_with_family
    FROM "assets"
    WHERE deleted_at IS NULL AND family_id IS NOT NULL AND group_id IS NULL;

    SELECT COUNT(*) INTO missing_group_name_with_group_id
    FROM "assets"
    WHERE deleted_at IS NULL AND group_id IS NOT NULL AND group_name IS NULL;

    IF missing_stock_mode > 0 THEN
        RAISE EXCEPTION 'Backfill incomplete: % live assets have NULL stock_mode',
            missing_stock_mode;
    END IF;

    IF missing_group_id_with_family > 0 THEN
        RAISE EXCEPTION 'Backfill incomplete: % live assets with family_id have NULL group_id',
            missing_group_id_with_family;
    END IF;

    IF missing_group_name_with_group_id > 0 THEN
        RAISE EXCEPTION 'Backfill incomplete: % live assets with group_id have NULL group_name',
            missing_group_name_with_group_id;
    END IF;
END $$;

-- Enforce stock_mode NOT NULL once backfill verified
ALTER TABLE "assets" ALTER COLUMN "stock_mode" SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage D: RENAME asset_families → legacy_asset_families,
--          DROP FKs + dead columns
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop FK on stock_movements.asset_family_id (KEEP column as plain uuid for
-- historical audit-ledger lookup). The column data is preserved; only the
-- referential-integrity enforcement is removed.
ALTER TABLE "stock_movements"
    DROP CONSTRAINT IF EXISTS "stock_movements_asset_family_id_asset_families_id_fk";

-- Drop FK on assets.family_id + drop the column
ALTER TABLE "assets"
    DROP CONSTRAINT IF EXISTS "assets_family_id_asset_families_id_fk";

ALTER TABLE "assets" DROP COLUMN IF EXISTS "family_id";

-- Drop tracking_method column (replaced by stock_mode on assets).
-- The trackingMethodEnum pgEnum type is intentionally left in place as a
-- dead-type — harmless, easy cleanup later if desired.
ALTER TABLE "assets" DROP COLUMN IF EXISTS "tracking_method";

-- Rename asset_families → legacy_asset_families. Indexes + remaining
-- constraints carry the rename automatically. No service code reads from
-- this table at runtime post-cutover; it exists only as a historical-data
-- safety net for export queries that need legacy labels.
ALTER TABLE "asset_families" RENAME TO "legacy_asset_families";
