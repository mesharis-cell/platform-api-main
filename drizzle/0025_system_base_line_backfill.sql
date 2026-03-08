WITH existing_max AS (
    SELECT
        platform_id,
        COALESCE(
            MAX(
                CASE
                    WHEN line_item_id ~ '^K-[0-9]{6}$' THEN substring(line_item_id FROM 3)::integer
                    ELSE NULL
                END
            ),
            0
        ) AS max_sequence
    FROM line_items
    GROUP BY platform_id
),
order_candidates AS (
    SELECT
        o.platform_id,
        o.id AS entity_id,
        'ORDER'::invoice_type AS purpose_type,
        'order'::text AS entity_bucket,
        o.created_by AS added_by,
        COALESCE((o.calculated_totals ->> 'volume')::numeric, 0::numeric) AS quantity,
        'm3'::varchar(20) AS unit,
        CASE
            WHEN COALESCE((o.calculated_totals ->> 'volume')::numeric, 0::numeric) > 0
                THEN ROUND(base_line.buy_total / NULLIF((o.calculated_totals ->> 'volume')::numeric, 0), 2)
            ELSE base_line.buy_total
        END AS unit_rate,
        base_line.buy_total AS total,
        base_line.billing_mode
    FROM orders o
    JOIN companies c ON c.id = o.company
    JOIN prices p ON p.entity_type = 'ORDER' AND p.entity_id = o.id AND p.platform_id = o.platform_id
    JOIN LATERAL (
        SELECT
            COALESCE((line->>'buy_total')::numeric, 0::numeric) AS buy_total,
            COALESCE(NULLIF(line->>'billing_mode', ''), 'BILLABLE')::billing_mode AS billing_mode
        FROM jsonb_array_elements(COALESCE(p.breakdown_lines, '[]'::jsonb)) AS line
        WHERE line->>'line_kind' = 'BASE_OPS'
          AND COALESCE((line->>'is_voided')::boolean, false) = false
        LIMIT 1
    ) AS base_line ON true
    LEFT JOIN line_items li
        ON li.platform_id = o.platform_id
       AND li.order_id = o.id
       AND li.system_key = 'BASE_OPS'
       AND li.is_voided = false
    WHERE COALESCE((c.features ->> 'enable_base_operations')::boolean, true) = true
      AND o.order_status NOT IN ('CLOSED', 'CANCELLED', 'DECLINED')
      AND li.id IS NULL
      AND base_line.buy_total > 0
),
inbound_candidates AS (
    SELECT
        ir.platform_id,
        ir.id AS entity_id,
        'INBOUND_REQUEST'::invoice_type AS purpose_type,
        'inbound'::text AS entity_bucket,
        ir.created_by AS added_by,
        1::numeric AS quantity,
        'service'::varchar(20) AS unit,
        base_line.buy_total AS unit_rate,
        base_line.buy_total AS total,
        base_line.billing_mode
    FROM inbound_requests ir
    JOIN companies c ON c.id = ir.company_id
    JOIN prices p
        ON p.entity_type = 'INBOUND_REQUEST'
       AND p.entity_id = ir.id
       AND p.platform_id = ir.platform_id
    JOIN LATERAL (
        SELECT
            COALESCE((line->>'buy_total')::numeric, 0::numeric) AS buy_total,
            COALESCE(NULLIF(line->>'billing_mode', ''), 'BILLABLE')::billing_mode AS billing_mode
        FROM jsonb_array_elements(COALESCE(p.breakdown_lines, '[]'::jsonb)) AS line
        WHERE line->>'line_kind' = 'BASE_OPS'
          AND COALESCE((line->>'is_voided')::boolean, false) = false
        LIMIT 1
    ) AS base_line ON true
    LEFT JOIN line_items li
        ON li.platform_id = ir.platform_id
       AND li.inbound_request_id = ir.id
       AND li.system_key = 'BASE_OPS'
       AND li.is_voided = false
    WHERE COALESCE((c.features ->> 'enable_base_operations')::boolean, true) = true
      AND ir.request_status NOT IN ('COMPLETED', 'DECLINED', 'CANCELLED')
      AND li.id IS NULL
      AND base_line.buy_total > 0
),
base_line_candidates AS (
    SELECT *
    FROM order_candidates
    UNION ALL
    SELECT *
    FROM inbound_candidates
),
numbered_candidates AS (
    SELECT
        c.*,
        ROW_NUMBER() OVER (PARTITION BY c.platform_id ORDER BY c.entity_bucket, c.entity_id) AS seq_offset,
        COALESCE(em.max_sequence, 0) AS max_sequence
    FROM base_line_candidates c
    LEFT JOIN existing_max em ON em.platform_id = c.platform_id
),
inserted AS (
    INSERT INTO line_items (
        line_item_id,
        platform_id,
        order_id,
        inbound_request_id,
        purpose_type,
        line_item_type,
        system_key,
        billing_mode,
        category,
        description,
        quantity,
        unit,
        unit_rate,
        total,
        added_by,
        notes,
        metadata,
        client_price_visible,
        created_at,
        updated_at
    )
    SELECT
        'K-' || LPAD((max_sequence + seq_offset)::text, 6, '0') AS line_item_id,
        platform_id,
        CASE WHEN entity_bucket = 'order' THEN entity_id ELSE NULL END AS order_id,
        CASE WHEN entity_bucket = 'inbound' THEN entity_id ELSE NULL END AS inbound_request_id,
        purpose_type,
        'SYSTEM'::line_item_type,
        'BASE_OPS'::system_line_key,
        billing_mode,
        'HANDLING'::service_category,
        'Picking & Handling',
        quantity,
        unit,
        unit_rate,
        total,
        added_by,
        'System-generated base operations line',
        jsonb_build_object('source', 'migration_backfill'),
        false,
        now(),
        now()
    FROM numbered_candidates
    RETURNING
        id,
        line_item_id,
        platform_id,
        order_id,
        inbound_request_id
),
inserted_map AS (
    SELECT
        platform_id,
        order_id,
        inbound_request_id,
        line_item_id
    FROM inserted
)
UPDATE prices p
SET breakdown_lines = (
    SELECT jsonb_agg(
        CASE
            WHEN line->>'line_kind' = 'BASE_OPS' THEN
                jsonb_set(
                    jsonb_set(
                        line,
                        '{line_id}',
                        to_jsonb(
                            COALESCE(
                                im.line_item_id,
                                line->>'line_id'
                            )
                        ),
                        true
                    ),
                    '{source,mode}',
                    to_jsonb('SYSTEM_LINE_ITEM'::text),
                    true
                )
            ELSE line
        END
    )
    FROM jsonb_array_elements(COALESCE(p.breakdown_lines, '[]'::jsonb)) AS line
)
FROM inserted_map im
WHERE p.platform_id = im.platform_id
  AND (
      (p.entity_type = 'ORDER' AND p.entity_id = im.order_id)
      OR
      (p.entity_type = 'INBOUND_REQUEST' AND p.entity_id = im.inbound_request_id)
  );
