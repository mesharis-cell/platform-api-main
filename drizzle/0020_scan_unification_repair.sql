-- Repair migration for drifted environments where 0018 partially applied.
-- Goal: enforce final scan-unification schema/data shape idempotently.

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

INSERT INTO "scan_event_assets" ("scan_event_id", "asset_id", "quantity")
SELECT se."id", se."asset", GREATEST(COALESCE(se."quantity", 1), 0)
FROM "scan_events" se
WHERE se."asset" IS NOT NULL
ON CONFLICT ("scan_event_id", "asset_id") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scan_events'
      AND column_name = 'photos'
  ) THEN
    EXECUTE $sql$
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
      WHERE p."url" IS NOT NULL
        AND length(trim(p."url")) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = p."url"
            AND sem."media_kind" = 'GENERAL'
            AND sem."sort_order" = p."ord" - 1
        );
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scan_events'
      AND column_name = 'latest_return_images'
  ) THEN
    EXECUTE $sql$
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
      WHERE p."url" IS NOT NULL
        AND length(trim(p."url")) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = p."url"
            AND sem."media_kind" = 'RETURN_WIDE'
            AND sem."sort_order" = p."ord" - 1
        );
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scan_events'
      AND column_name = 'damage_report_entries'
  ) THEN
    EXECUTE $sql$
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
      WHERE COALESCE(de."entry" ->> 'url', '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = de."entry" ->> 'url'
            AND sem."media_kind" = 'DAMAGE'
            AND sem."sort_order" = de."ord" - 1
        );
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scan_events'
      AND column_name = 'damage_report_photos'
  ) THEN
    EXECUTE $sql$
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
      WHERE p."url" IS NOT NULL
        AND length(trim(p."url")) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = p."url"
            AND sem."media_kind" = 'DAMAGE'
            AND sem."sort_order" = p."ord" - 1
        );
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'derig_photos'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'derig_notes'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
      SELECT
        oi."order",
        oi."asset",
        'DERIG_CAPTURE'::"scan_type",
        0,
        NULL,
        oi."derig_notes",
        NULL,
        jsonb_build_object('order_item_id', oi."id"::text, 'legacy_backfill', true),
        o."created_by",
        COALESCE(o."updated_at", now())
      FROM "order_items" oi
      INNER JOIN "orders" o ON o."id" = oi."order"
      WHERE (
          cardinality(COALESCE(oi."derig_photos", ARRAY[]::text[])) > 0
          OR oi."derig_notes" IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_events" se
          WHERE se."order" = oi."order"
            AND se."scan_type" = 'DERIG_CAPTURE'
            AND se."metadata" ->> 'order_item_id' = oi."id"::text
        );
    $sql$;

    EXECUTE $sql$
      INSERT INTO "scan_event_assets" ("scan_event_id", "asset_id", "quantity")
      SELECT
        se."id",
        oi."asset",
        GREATEST(oi."quantity", 0)
      FROM "scan_events" se
      INNER JOIN "order_items" oi ON se."metadata" ->> 'order_item_id' = oi."id"::text
      WHERE se."scan_type" = 'DERIG_CAPTURE'
        AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
      ON CONFLICT ("scan_event_id", "asset_id") DO NOTHING;
    $sql$;

    EXECUTE $sql$
      INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
      SELECT
        gen_random_uuid(),
        se."id",
        p."url",
        NULL,
        'DERIG',
        p."ord" - 1,
        now()
      FROM "scan_events" se
      INNER JOIN "order_items" oi ON se."metadata" ->> 'order_item_id' = oi."id"::text
      CROSS JOIN LATERAL unnest(COALESCE(oi."derig_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
      WHERE se."scan_type" = 'DERIG_CAPTURE'
        AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
        AND p."url" IS NOT NULL
        AND length(trim(p."url")) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = p."url"
            AND sem."media_kind" = 'DERIG'
            AND sem."sort_order" = p."ord" - 1
        );
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'truck_photos'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
      SELECT
        o."id",
        NULL,
        'OUTBOUND_TRUCK_PHOTOS'::"scan_type",
        0,
        NULL,
        'Outbound truck loading photos',
        NULL,
        jsonb_build_object('legacy_backfill', true),
        o."created_by",
        COALESCE(o."updated_at", now())
      FROM "orders" o
      WHERE cardinality(COALESCE(o."truck_photos", ARRAY[]::text[])) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_events" se
          WHERE se."order" = o."id"
            AND se."scan_type" = 'OUTBOUND_TRUCK_PHOTOS'
            AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
        );
    $sql$;

    EXECUTE $sql$
      INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
      SELECT
        gen_random_uuid(),
        se."id",
        p."url",
        NULL,
        'TRUCK_OUTBOUND',
        p."ord" - 1,
        now()
      FROM "orders" o
      INNER JOIN "scan_events" se ON se."order" = o."id"
      CROSS JOIN LATERAL unnest(COALESCE(o."truck_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
      WHERE se."scan_type" = 'OUTBOUND_TRUCK_PHOTOS'
        AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
        AND p."url" IS NOT NULL
        AND length(trim(p."url")) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = p."url"
            AND sem."media_kind" = 'TRUCK_OUTBOUND'
            AND sem."sort_order" = p."ord" - 1
        );
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'return_truck_photos'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
      SELECT
        o."id",
        NULL,
        'RETURN_TRUCK_PHOTOS'::"scan_type",
        0,
        NULL,
        'Return truck pickup photos',
        NULL,
        jsonb_build_object('legacy_backfill', true),
        o."created_by",
        COALESCE(o."updated_at", now())
      FROM "orders" o
      WHERE cardinality(COALESCE(o."return_truck_photos", ARRAY[]::text[])) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_events" se
          WHERE se."order" = o."id"
            AND se."scan_type" = 'RETURN_TRUCK_PHOTOS'
            AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
        );
    $sql$;

    EXECUTE $sql$
      INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
      SELECT
        gen_random_uuid(),
        se."id",
        p."url",
        NULL,
        'TRUCK_RETURN',
        p."ord" - 1,
        now()
      FROM "orders" o
      INNER JOIN "scan_events" se ON se."order" = o."id"
      CROSS JOIN LATERAL unnest(COALESCE(o."return_truck_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
      WHERE se."scan_type" = 'RETURN_TRUCK_PHOTOS'
        AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
        AND p."url" IS NOT NULL
        AND length(trim(p."url")) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = p."url"
            AND sem."media_kind" = 'TRUCK_RETURN'
            AND sem."sort_order" = p."ord" - 1
        );
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'on_site_photos'
  ) THEN
    EXECUTE $sql$
      INSERT INTO "scan_events" ("order", "asset", "scan_type", "quantity", "condition", "notes", "discrepancy_reason", "metadata", "scanned_by", "scanned_at")
      SELECT
        o."id",
        NULL,
        'ON_SITE_CAPTURE'::"scan_type",
        0,
        NULL,
        'On site captures',
        NULL,
        jsonb_build_object('legacy_backfill', true),
        o."created_by",
        COALESCE(o."updated_at", now())
      FROM "orders" o
      WHERE cardinality(COALESCE(o."on_site_photos", ARRAY[]::text[])) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_events" se
          WHERE se."order" = o."id"
            AND se."scan_type" = 'ON_SITE_CAPTURE'
            AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
        );
    $sql$;

    EXECUTE $sql$
      INSERT INTO "scan_event_media" ("id", "scan_event_id", "url", "note", "media_kind", "sort_order", "created_at")
      SELECT
        gen_random_uuid(),
        se."id",
        p."url",
        NULL,
        'ON_SITE',
        p."ord" - 1,
        now()
      FROM "orders" o
      INNER JOIN "scan_events" se ON se."order" = o."id"
      CROSS JOIN LATERAL unnest(COALESCE(o."on_site_photos", ARRAY[]::text[])) WITH ORDINALITY AS p("url", "ord")
      WHERE se."scan_type" = 'ON_SITE_CAPTURE'
        AND COALESCE(se."metadata" ->> 'legacy_backfill', '') = 'true'
        AND p."url" IS NOT NULL
        AND length(trim(p."url")) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "scan_event_media" sem
          WHERE sem."scan_event_id" = se."id"
            AND sem."url" = p."url"
            AND sem."media_kind" = 'ON_SITE'
            AND sem."sort_order" = p."ord" - 1
        );
    $sql$;
  END IF;
END $$;

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
