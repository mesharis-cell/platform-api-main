-- Migration 0042 — asset categories: first-class table + FK + drop varchar
--
-- Replaces the free-text asset_families.category varchar with a structured
-- asset_categories table supporting platform-wide universal categories and
-- company-specific categories. Includes seed, backfill, and column drop.
--
-- Additive stages A-B, then destructive stage C-D (column drop). All safe:
-- pre-alpha for this surface, staging-only, no production data at risk.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: Create asset_categories table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "asset_categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "platform_id" uuid NOT NULL REFERENCES "platforms"("id") ON DELETE CASCADE,
    "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
    "name" varchar(100) NOT NULL,
    "slug" varchar(120) NOT NULL,
    "color" varchar(7) NOT NULL,
    "sort_order" integer NOT NULL DEFAULT 0,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_by" uuid,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Universal categories: one slug per platform (company_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "asset_categories_universal_slug_idx"
    ON "asset_categories" ("platform_id", "slug") WHERE "company_id" IS NULL;

-- Company-specific categories: one slug per (platform, company)
CREATE UNIQUE INDEX IF NOT EXISTS "asset_categories_company_slug_idx"
    ON "asset_categories" ("platform_id", "company_id", "slug") WHERE "company_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "asset_categories_platform_idx"
    ON "asset_categories" ("platform_id");

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: Seed 6 universal categories per platform
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO "asset_categories" ("platform_id", "company_id", "name", "slug", "color", "sort_order", "is_active")
SELECT p.id, NULL, v.name, v.slug, v.color, v.sort_order, true
FROM "platforms" p
CROSS JOIN (VALUES
    ('Furniture',    'furniture',    '#3B7A57', 0),
    ('Glassware',    'glassware',    '#4A6FA5', 1),
    ('Installation', 'installation', '#8B6914', 2),
    ('Decor',        'decor',        '#7B4B94', 3),
    ('General',      'general',      '#5A5A5A', 4),
    ('Unknown',      'unknown',      '#888888', 5)
) AS v(name, slug, color, sort_order)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage C: Add category_id FK + backfill from varchar
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "asset_families" ADD COLUMN IF NOT EXISTS "category_id" uuid
    REFERENCES "asset_categories"("id") ON DELETE SET NULL;

-- Backfill: match known category names to the seeded universal categories
UPDATE "asset_families" af
SET category_id = ac.id
FROM "asset_categories" ac
WHERE ac.platform_id = af.platform_id
  AND ac.company_id IS NULL
  AND ac.slug = LOWER(TRIM(af.category))
  AND LOWER(TRIM(af.category)) IN ('furniture', 'glassware', 'installation', 'decor', 'general', 'unknown');

-- Everything else (brand-name abuses, typos, etc.) → "Unknown"
UPDATE "asset_families" af
SET category_id = ac.id
FROM "asset_categories" ac
WHERE af.category_id IS NULL
  AND ac.platform_id = af.platform_id
  AND ac.company_id IS NULL
  AND ac.slug = 'unknown';

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage D: Enforce NOT NULL + drop the old varchar
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "asset_families" ALTER COLUMN "category_id" SET NOT NULL;
ALTER TABLE "asset_families" DROP COLUMN IF EXISTS "category";

CREATE INDEX IF NOT EXISTS "asset_families_category_idx"
    ON "asset_families" ("category_id");
