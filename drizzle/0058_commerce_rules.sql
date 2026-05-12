-- Migration: 0058_commerce_rules
--
-- Item 6 of the 9-item bundle. Generic, admin-configurable cart-time
-- validation rules. v1 surfaces QUANTITY + COMPANION rule types with
-- WARN severity, but the schema reserves full forward-compat vocabulary
-- so v2 expansions (BLOCK/SUGGEST severities, CONFLICT/CATEGORY/BRAND
-- rule types) require zero migration.
--
-- target + predicate are tagged-union JSONBs:
--   target:    { kind: 'ASSET' | 'FAMILY', asset_id?: uuid, family_id?: uuid }
--                v2 adds: CATEGORY | BRAND | TAG
--   predicate: { kind: 'QUANTITY_LT' | 'QUANTITY_GT', threshold: number }
--            | { kind: 'COMPANION_REQUIRED', companion_target: target }
--                v2 adds: QUANTITY_EQ, COMPANION_FORBIDDEN, etc.

CREATE TYPE "commerce_rule_type" AS ENUM (
    'QUANTITY',
    'COMPANION',
    'CONFLICT',
    'CATEGORY',
    'BRAND'
);

CREATE TYPE "commerce_rule_severity" AS ENUM (
    'WARN',
    'BLOCK',
    'SUGGEST'
);

CREATE TABLE IF NOT EXISTS "commerce_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "platform_id" uuid NOT NULL REFERENCES "platforms"("id") ON DELETE CASCADE,
    -- null = platform-wide; set = company-specific override. Resolution at
    -- evaluation is UNION of (platform-wide ∪ caller-company-specific).
    "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
    "name" varchar(200) NOT NULL,
    "description" text,
    "rule_type" "commerce_rule_type" NOT NULL,
    "severity" "commerce_rule_severity" NOT NULL DEFAULT 'WARN',
    "target" jsonb NOT NULL,
    "predicate" jsonb NOT NULL,
    "message" text NOT NULL,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    "deleted_at" timestamp
);

CREATE INDEX IF NOT EXISTS "commerce_rules_platform_idx"
  ON "commerce_rules" ("platform_id");
CREATE INDEX IF NOT EXISTS "commerce_rules_company_idx"
  ON "commerce_rules" ("company_id");
CREATE INDEX IF NOT EXISTS "commerce_rules_active_idx"
  ON "commerce_rules" ("is_active")
  WHERE "deleted_at" IS NULL;
