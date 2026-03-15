WITH duplicate_groups AS (
    SELECT platform_id, company_id, name
    FROM asset_families
    WHERE deleted_at IS NULL
    GROUP BY platform_id, company_id, name
    HAVING COUNT(*) > 1
),
ranked_families AS (
    SELECT
        af.id,
        af.platform_id,
        af.company_id,
        af.name,
        ROW_NUMBER() OVER (
            PARTITION BY af.platform_id, af.company_id, af.name
            ORDER BY
                CASE WHEN af.team_id IS NOT NULL THEN 1 ELSE 0 END DESC,
                CASE WHEN COALESCE(af.weight_per_unit, 0) > 0 THEN 1 ELSE 0 END DESC,
                CASE WHEN COALESCE(af.volume_per_unit, 0) > 0 THEN 1 ELSE 0 END DESC,
                CASE
                    WHEN NULLIF(TRIM(COALESCE(af.description, '')), '') IS NOT NULL
                     AND TRIM(COALESCE(af.description, '')) NOT ILIKE 'Source:%'
                    THEN 1
                    ELSE 0
                END DESC,
                af.created_at ASC,
                af.id ASC
        ) AS rank_in_group,
        FIRST_VALUE(af.id) OVER (
            PARTITION BY af.platform_id, af.company_id, af.name
            ORDER BY
                CASE WHEN af.team_id IS NOT NULL THEN 1 ELSE 0 END DESC,
                CASE WHEN COALESCE(af.weight_per_unit, 0) > 0 THEN 1 ELSE 0 END DESC,
                CASE WHEN COALESCE(af.volume_per_unit, 0) > 0 THEN 1 ELSE 0 END DESC,
                CASE
                    WHEN NULLIF(TRIM(COALESCE(af.description, '')), '') IS NOT NULL
                     AND TRIM(COALESCE(af.description, '')) NOT ILIKE 'Source:%'
                    THEN 1
                    ELSE 0
                END DESC,
                af.created_at ASC,
                af.id ASC
        ) AS canonical_id
    FROM asset_families af
    INNER JOIN duplicate_groups dg
        ON dg.platform_id = af.platform_id
       AND dg.company_id = af.company_id
       AND dg.name = af.name
    WHERE af.deleted_at IS NULL
),
repointed_assets AS (
    UPDATE assets AS a
    SET family_id = rf.canonical_id
    FROM ranked_families rf
    WHERE rf.rank_in_group > 1
      AND a.family_id = rf.id
    RETURNING a.id
)
UPDATE asset_families AS af
SET
    deleted_at = COALESCE(af.deleted_at, NOW()),
    is_active = false,
    updated_at = NOW(),
    name = CONCAT(af.name, ' [merged ', LEFT(af.id::text, 8), ']')
FROM ranked_families rf
WHERE rf.rank_in_group > 1
  AND af.id = rf.id
  AND af.deleted_at IS NULL;

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
