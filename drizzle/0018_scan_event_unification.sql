ALTER TYPE "scan_type" ADD VALUE IF NOT EXISTS 'DERIG_CAPTURE';
ALTER TYPE "scan_type" ADD VALUE IF NOT EXISTS 'OUTBOUND_TRUCK_PHOTOS';
ALTER TYPE "scan_type" ADD VALUE IF NOT EXISTS 'RETURN_TRUCK_PHOTOS';
ALTER TYPE "scan_type" ADD VALUE IF NOT EXISTS 'ON_SITE_CAPTURE';

ALTER TABLE "scan_events" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "scan_events" ALTER COLUMN "asset" DROP NOT NULL;
ALTER TABLE "scan_events" ALTER COLUMN "condition" DROP NOT NULL;
ALTER TABLE "scan_events" ALTER COLUMN "scanned_by" DROP NOT NULL;
ALTER TABLE "scan_events" ALTER COLUMN "quantity" SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS "scan_event_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scan_event_id" uuid NOT NULL REFERENCES "scan_events"("id") ON DELETE cascade,
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE cascade,
  "quantity" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "scan_event_assets_event_asset_unique" UNIQUE("scan_event_id", "asset_id")
);

CREATE INDEX IF NOT EXISTS "scan_event_assets_event_idx" ON "scan_event_assets"("scan_event_id");
CREATE INDEX IF NOT EXISTS "scan_event_assets_asset_idx" ON "scan_event_assets"("asset_id");

CREATE TABLE IF NOT EXISTS "scan_event_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scan_event_id" uuid NOT NULL REFERENCES "scan_events"("id") ON DELETE cascade,
  "url" text NOT NULL,
  "note" text,
  "media_kind" varchar(32) NOT NULL DEFAULT 'GENERAL',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "scan_event_media_event_idx" ON "scan_event_media"("scan_event_id");
CREATE INDEX IF NOT EXISTS "scan_event_media_kind_idx" ON "scan_event_media"("media_kind");

-- Backfill canonical asset links for existing scan events.
INSERT INTO "scan_event_assets" ("scan_event_id", "asset_id", "quantity")
SELECT se."id", se."asset", GREATEST(COALESCE(se."quantity", 1), 0)
FROM "scan_events" se
WHERE se."asset" IS NOT NULL
ON CONFLICT ("scan_event_id", "asset_id") DO NOTHING;

-- Backfill generic media from legacy scan_events.photos
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  se."id",
  p."url",
  NULL,
  'GENERAL',
  p."ord" - 1,
  now()
FROM "scan_events" se
CROSS JOIN LATERAL unnest(COALESCE(se."photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL AND length(trim(p."url")) > 0;

-- Backfill return-wide imagery from legacy scan_events.latest_return_images
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  se."id",
  p."url",
  NULL,
  'RETURN_WIDE',
  p."ord" - 1,
  now()
FROM "scan_events" se
CROSS JOIN LATERAL unnest(COALESCE(se."latest_return_images", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL AND length(trim(p."url")) > 0;

-- Backfill damage entries from legacy jsonb shape.
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  se."id",
  de."entry" ->> 'url',
  NULLIF(trim(de."entry" ->> 'description'), ''),
  'DAMAGE',
  de."ord" - 1,
  now()
FROM "scan_events" se
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(se."damage_report_entries", '[]'::jsonb)) WITH ORDINALITY AS de("entry", "ord")
WHERE COALESCE(de."entry" ->> 'url', '') <> '';

-- Backfill legacy damage_report_photos list.
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  se."id",
  p."url",
  NULL,
  'DAMAGE',
  p."ord" - 1,
  now()
FROM "scan_events" se
CROSS JOIN LATERAL unnest(COALESCE(se."damage_report_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL AND length(trim(p."url")) > 0;

-- Backfill legacy derig captures from order_items into canonical scan events.
WITH derig_rows AS (
  SELECT
    oi."id" AS order_item_id,
    oi."order" AS order_id,
    oi."asset" AS asset_id,
    oi."derig_notes" AS notes,
    oi."derig_photos" AS photos,
    o."created_by" AS scanned_by,
    COALESCE(o."updated_at", now()) AS scanned_at
  FROM "order_items" oi
  INNER JOIN "orders" o ON o."id" = oi."order"
  WHERE cardinality(COALESCE(oi."derig_photos", ARRAY[]::text[])) > 0
     OR oi."derig_notes" IS NOT NULL
), inserted AS (
  INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
  SELECT
    dr.order_id,
    dr.asset_id,
    'DERIG_CAPTURE'::"scan_type",
    0,
    NULL,
    dr.notes,
    NULL,
    jsonb_build_object('order_item_id', dr.order_item_id::text, 'legacy_backfill', true),
    dr.scanned_by,
    dr.scanned_at
  FROM derig_rows dr
  RETURNING "id", "order", "asset", "metadata"
)
INSERT INTO "scan_event_assets" ("scan_event_id", "asset_id", "quantity")
SELECT ins."id", ins."asset", 0
FROM inserted ins
WHERE ins."asset" IS NOT NULL
ON CONFLICT ("scan_event_id", "asset_id") DO NOTHING;

WITH derig_rows AS (
  SELECT
    oi."id" AS order_item_id,
    oi."order" AS order_id,
    oi."derig_photos" AS photos
  FROM "order_items" oi
  WHERE cardinality(COALESCE(oi."derig_photos", ARRAY[]::text[])) > 0
), inserted AS (
  SELECT se."id", (se."metadata" ->> 'order_item_id') AS order_item_id
  FROM "scan_events" se
  WHERE se."scan_type" = 'DERIG_CAPTURE'
    AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
)
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  ins."id",
  p."url",
  NULL,
  'DERIG',
  p."ord" - 1,
  now()
FROM inserted ins
INNER JOIN derig_rows dr ON dr.order_item_id::text = ins.order_item_id
CROSS JOIN LATERAL unnest(COALESCE(dr.photos, ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL AND length(trim(p."url")) > 0;

-- Backfill legacy order-level truck photos and on-site photos.
WITH outbound_rows AS (
  SELECT o."id" AS order_id, o."created_by" AS scanned_by, COALESCE(o."updated_at", now()) AS scanned_at
  FROM "orders" o
  WHERE cardinality(COALESCE(o."truck_photos", ARRAY[]::text[])) > 0
), inserted AS (
  INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
  SELECT
    r.order_id,
    NULL,
    'OUTBOUND_TRUCK_PHOTOS'::"scan_type",
    0,
    NULL,
    'Outbound truck loading photos',
    NULL,
    jsonb_build_object('legacy_backfill', true),
    r.scanned_by,
    r.scanned_at
  FROM outbound_rows r
  RETURNING "id", "order"
)
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  ins."id",
  p."url",
  NULL,
  'TRUCK_OUTBOUND',
  p."ord" - 1,
  now()
FROM inserted ins
INNER JOIN "orders" o ON o."id" = ins."order"
CROSS JOIN LATERAL unnest(COALESCE(o."truck_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL AND length(trim(p."url")) > 0;

WITH return_rows AS (
  SELECT o."id" AS order_id, o."created_by" AS scanned_by, COALESCE(o."updated_at", now()) AS scanned_at
  FROM "orders" o
  WHERE cardinality(COALESCE(o."return_truck_photos", ARRAY[]::text[])) > 0
), inserted AS (
  INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
  SELECT
    r.order_id,
    NULL,
    'RETURN_TRUCK_PHOTOS'::"scan_type",
    0,
    NULL,
    'Return truck pickup photos',
    NULL,
    jsonb_build_object('legacy_backfill', true),
    r.scanned_by,
    r.scanned_at
  FROM return_rows r
  RETURNING "id", "order"
)
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  ins."id",
  p."url",
  NULL,
  'TRUCK_RETURN',
  p."ord" - 1,
  now()
FROM inserted ins
INNER JOIN "orders" o ON o."id" = ins."order"
CROSS JOIN LATERAL unnest(COALESCE(o."return_truck_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL AND length(trim(p."url")) > 0;

WITH onsite_rows AS (
  SELECT o."id" AS order_id, o."created_by" AS scanned_by, COALESCE(o."updated_at", now()) AS scanned_at
  FROM "orders" o
  WHERE cardinality(COALESCE(o."on_site_photos", ARRAY[]::text[])) > 0
), inserted AS (
  INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
  SELECT
    r.order_id,
    NULL,
    'ON_SITE_CAPTURE'::"scan_type",
    0,
    NULL,
    'On site captures',
    NULL,
    jsonb_build_object('legacy_backfill', true),
    r.scanned_by,
    r.scanned_at
  FROM onsite_rows r
  RETURNING "id", "order"
)
INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
SELECT
  gen_random_uuid(),
  ins."id",
  p."url",
  NULL,
  'ON_SITE',
  p."ord" - 1,
  now()
FROM inserted ins
INNER JOIN "orders" o ON o."id" = ins."order"
CROSS JOIN LATERAL unnest(COALESCE(o."on_site_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
WHERE p."url" IS NOT NULL AND length(trim(p."url")) > 0;

-- Backfill event asset links for order-level captures from order items.
INSERT INTO "scan_event_assets" ("scan_event_id", "asset_id", "quantity")
SELECT DISTINCT
  se."id",
  oi."asset",
  GREATEST(oi."quantity", 0)
FROM "scan_events" se
INNER JOIN "order_items" oi ON oi."order" = se."order"
WHERE se."scan_type" IN ('OUTBOUND_TRUCK_PHOTOS', 'RETURN_TRUCK_PHOTOS', 'ON_SITE_CAPTURE')
  AND se."asset" IS NULL
ON CONFLICT ("scan_event_id", "asset_id") DO NOTHING;

ALTER TABLE "orders" DROP COLUMN IF EXISTS "truck_photos";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "return_truck_photos";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "on_site_photos";

ALTER TABLE "order_items" DROP COLUMN IF EXISTS "derig_photos";
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "derig_notes";

ALTER TABLE "scan_events" DROP COLUMN IF EXISTS "photos";
ALTER TABLE "scan_events" DROP COLUMN IF EXISTS "latest_return_images";
ALTER TABLE "scan_events" DROP COLUMN IF EXISTS "damage_report_photos";
ALTER TABLE "scan_events" DROP COLUMN IF EXISTS "damage_report_entries";
