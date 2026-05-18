-- Migration: 0055_collection_items_soft_delete
--
-- Adds soft-delete to `collection_items` so removals leave an audit trail and
-- reads can distinguish "currently removed" from "never existed". Replaces
-- the existing hard unique constraint with a partial unique index so an
-- asset can be removed from a collection and re-added later without conflict
-- (only one non-deleted row per (collection, asset) is allowed).
--
-- Stages:
--   1. Add `deleted_at` column (nullable timestamp)
--   2. Drop the existing total unique constraint
--   3. Recreate the uniqueness as a partial index scoped to non-deleted rows
--   4. Add an index on `deleted_at` to keep filter queries fast

ALTER TABLE "collection_items"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

ALTER TABLE "collection_items"
  DROP CONSTRAINT IF EXISTS "collection_items_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "collection_items_active_unique"
  ON "collection_items" ("collection", "asset")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "collection_items_deleted_at_idx"
  ON "collection_items" ("deleted_at");
