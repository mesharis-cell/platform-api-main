DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'asset_families_platform_company_name_unique'
    ) THEN
        ALTER TABLE "asset_families"
        ADD CONSTRAINT "asset_families_platform_company_name_unique"
        UNIQUE ("platform_id", "company_id", "name");
    END IF;
END
$$;
