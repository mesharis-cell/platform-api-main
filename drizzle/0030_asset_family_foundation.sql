DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_mode') THEN
        CREATE TYPE "stock_mode" AS ENUM ('SERIALIZED', 'POOLED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "asset_families" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL,
    "company_id" uuid NOT NULL,
    "brand_id" uuid,
    "team_id" uuid,
    "name" varchar(200) NOT NULL,
    "description" text,
    "category" varchar(100) NOT NULL,
    "images" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "on_display_image" text,
    "stock_mode" "stock_mode" NOT NULL,
    "packaging" varchar(100),
    "weight_per_unit" numeric(8, 2),
    "dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "volume_per_unit" numeric(8, 3),
    "handling_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp NOT NULL,
    "deleted_at" timestamp
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'asset_families_platform_id_platforms_id_fk'
          AND table_name = 'asset_families'
    ) THEN
        ALTER TABLE "asset_families"
        ADD CONSTRAINT "asset_families_platform_id_platforms_id_fk"
        FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'asset_families_company_id_companies_id_fk'
          AND table_name = 'asset_families'
    ) THEN
        ALTER TABLE "asset_families"
        ADD CONSTRAINT "asset_families_company_id_companies_id_fk"
        FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'asset_families_brand_id_brands_id_fk'
          AND table_name = 'asset_families'
    ) THEN
        ALTER TABLE "asset_families"
        ADD CONSTRAINT "asset_families_brand_id_brands_id_fk"
        FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'asset_families_team_id_teams_id_fk'
          AND table_name = 'asset_families'
    ) THEN
        ALTER TABLE "asset_families"
        ADD CONSTRAINT "asset_families_team_id_teams_id_fk"
        FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE "assets"
ADD COLUMN IF NOT EXISTS "family_id" uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'assets_family_id_asset_families_id_fk'
          AND table_name = 'assets'
    ) THEN
        ALTER TABLE "assets"
        ADD CONSTRAINT "assets_family_id_asset_families_id_fk"
        FOREIGN KEY ("family_id") REFERENCES "public"."asset_families"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "asset_families_platform_idx" ON "asset_families" ("platform_id");
CREATE INDEX IF NOT EXISTS "asset_families_company_idx" ON "asset_families" ("company_id");
CREATE INDEX IF NOT EXISTS "asset_families_brand_idx" ON "asset_families" ("brand_id");
CREATE INDEX IF NOT EXISTS "asset_families_team_idx" ON "asset_families" ("team_id");
CREATE INDEX IF NOT EXISTS "asset_families_stock_mode_idx" ON "asset_families" ("stock_mode");
