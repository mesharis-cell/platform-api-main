ALTER TABLE "asset_families"
ADD COLUMN IF NOT EXISTS "company_item_code" varchar(150);

CREATE INDEX IF NOT EXISTS "asset_families_company_item_code_idx"
ON "asset_families" ("company_item_code");

CREATE UNIQUE INDEX IF NOT EXISTS "asset_families_platform_company_item_code_unique"
ON "asset_families" ("platform_id", "company_id", "company_item_code");
