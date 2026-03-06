-- Normalize assets.images to canonical AssetImage[] shape:
-- [{ "url": "https://...", "note": "optional" }]
WITH normalized_assets AS (
    SELECT
        a.id,
        COALESCE(
            (
                SELECT jsonb_agg(normalized_item)
                FROM (
                    SELECT
                        CASE
                            WHEN jsonb_typeof(elem) = 'object'
                                 AND elem ? 'url'
                                 AND nullif(btrim(elem->>'url'), '') IS NOT NULL
                                THEN CASE
                                    WHEN elem ? 'note'
                                         AND jsonb_typeof(elem->'note') = 'string'
                                         AND nullif(btrim(elem->>'note'), '') IS NOT NULL
                                        THEN jsonb_build_object(
                                            'url',
                                            btrim(elem->>'url'),
                                            'note',
                                            btrim(elem->>'note')
                                        )
                                    ELSE jsonb_build_object('url', btrim(elem->>'url'))
                                END
                            WHEN jsonb_typeof(elem) = 'string'
                                 AND nullif(btrim(trim(both '"' from elem::text)), '') IS NOT NULL
                                THEN jsonb_build_object(
                                    'url',
                                    btrim(trim(both '"' from elem::text))
                                )
                            ELSE NULL
                        END AS normalized_item
                    FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(a.images) = 'array' THEN a.images
                            ELSE '[]'::jsonb
                        END
                    ) AS source(elem)
                ) items
                WHERE normalized_item IS NOT NULL
            ),
            '[]'::jsonb
        ) AS normalized_images
    FROM assets a
)
UPDATE assets a
SET images = n.normalized_images
FROM normalized_assets n
WHERE a.id = n.id
  AND a.images IS DISTINCT FROM n.normalized_images;

-- Normalize asset_versions.snapshot.images with the same canonical shape.
WITH normalized_snapshots AS (
    SELECT
        av.id,
        COALESCE(
            (
                SELECT jsonb_agg(normalized_item)
                FROM (
                    SELECT
                        CASE
                            WHEN jsonb_typeof(elem) = 'object'
                                 AND elem ? 'url'
                                 AND nullif(btrim(elem->>'url'), '') IS NOT NULL
                                THEN CASE
                                    WHEN elem ? 'note'
                                         AND jsonb_typeof(elem->'note') = 'string'
                                         AND nullif(btrim(elem->>'note'), '') IS NOT NULL
                                        THEN jsonb_build_object(
                                            'url',
                                            btrim(elem->>'url'),
                                            'note',
                                            btrim(elem->>'note')
                                        )
                                    ELSE jsonb_build_object('url', btrim(elem->>'url'))
                                END
                            WHEN jsonb_typeof(elem) = 'string'
                                 AND nullif(btrim(trim(both '"' from elem::text)), '') IS NOT NULL
                                THEN jsonb_build_object(
                                    'url',
                                    btrim(trim(both '"' from elem::text))
                                )
                            ELSE NULL
                        END AS normalized_item
                    FROM jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(av.snapshot->'images') = 'array'
                                THEN av.snapshot->'images'
                            ELSE '[]'::jsonb
                        END
                    ) AS source(elem)
                ) items
                WHERE normalized_item IS NOT NULL
            ),
            '[]'::jsonb
        ) AS normalized_images
    FROM asset_versions av
    WHERE jsonb_typeof(av.snapshot) = 'object'
      AND av.snapshot ? 'images'
)
UPDATE asset_versions av
SET snapshot = jsonb_set(av.snapshot, '{images}', n.normalized_images, true)
FROM normalized_snapshots n
WHERE av.id = n.id
  AND (av.snapshot->'images') IS DISTINCT FROM n.normalized_images;
