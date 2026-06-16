-- Migration: 0068_backfill_on_display_image
--
-- Purpose: Backfill assets.on_display_image (and the group-level group_on_display_image)
--          from the first gallery image, so the curated-hero value is stored in DATA
--          rather than relying only on the `on_display_image ?? images[0]` fallback that
--          lives server-side (catalog) and at ~12 client call sites.
--
-- Scope:   `assets` table ONLY. Does NOT touch legacy_asset_families (dead since 0061).
--
-- Safety:  NON-DESTRUCTIVE — pure DML, no DDL, no enum changes.
--          FULLY IDEMPOTENT — the `IS NULL` guard means a re-run sets nothing that is
--          already populated (no-op). Only writes when the first gallery entry has a
--          real url; never overwrites an existing hero and never writes a null.
--
-- Apply:   `APP_ENV=staging|production bunx drizzle-kit migrate` only (hand-written; no generate).

-- 1) Per-asset hero — seed on_display_image from images[0].url where the hero is empty.
UPDATE "assets"
SET "on_display_image" = "images"->0->>'url'
WHERE "on_display_image" IS NULL
  AND jsonb_typeof("images") = 'array'
  AND jsonb_array_length("images") > 0
  AND "images"->0->>'url' IS NOT NULL;

-- 2) Group/family hero — seed group_on_display_image from group_images[0].url where empty.
UPDATE "assets"
SET "group_on_display_image" = "group_images"->0->>'url'
WHERE "group_on_display_image" IS NULL
  AND jsonb_typeof("group_images") = 'array'
  AND jsonb_array_length("group_images") > 0
  AND "group_images"->0->>'url' IS NOT NULL;
