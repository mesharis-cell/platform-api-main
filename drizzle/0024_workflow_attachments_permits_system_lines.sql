DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumlabel = 'SYSTEM'
          AND enumtypid = 'line_item_type'::regtype
    ) THEN
        ALTER TYPE line_item_type ADD VALUE 'SYSTEM';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_line_key') THEN
        CREATE TYPE system_line_key AS ENUM ('BASE_OPS');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_request_entity_type') THEN
        CREATE TYPE workflow_request_entity_type AS ENUM (
            'ORDER',
            'INBOUND_REQUEST',
            'SERVICE_REQUEST'
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_request_kind') THEN
        CREATE TYPE workflow_request_kind AS ENUM ('ARTWORK_SUPPORT');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_request_status') THEN
        CREATE TYPE workflow_request_status AS ENUM (
            'REQUESTED',
            'ACKNOWLEDGED',
            'IN_PROGRESS',
            'COMPLETED',
            'CANCELLED'
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attachment_entity_type') THEN
        CREATE TYPE attachment_entity_type AS ENUM (
            'ORDER',
            'INBOUND_REQUEST',
            'SERVICE_REQUEST',
            'WORKFLOW_REQUEST'
        );
    END IF;
END
$$;

ALTER TABLE line_items
    ADD COLUMN IF NOT EXISTS system_key system_line_key;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS permit_requirements jsonb;

CREATE TABLE IF NOT EXISTS workflow_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    entity_type workflow_request_entity_type NOT NULL,
    entity_id uuid NOT NULL,
    workflow_kind workflow_request_kind NOT NULL DEFAULT 'ARTWORK_SUPPORT',
    status workflow_request_status NOT NULL DEFAULT 'REQUESTED',
    title varchar(200) NOT NULL,
    description text,
    requested_by uuid NOT NULL REFERENCES users(id),
    requested_by_role user_role NOT NULL,
    assigned_email varchar(255),
    requested_at timestamp NOT NULL DEFAULT now(),
    acknowledged_at timestamp,
    completed_at timestamp,
    cancelled_at timestamp,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachment_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    code varchar(64) NOT NULL,
    label varchar(120) NOT NULL,
    allowed_entity_types attachment_entity_type[] NOT NULL DEFAULT ARRAY[]::attachment_entity_type[],
    default_visible_to_client boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT attachment_types_platform_code_unique UNIQUE (platform_id, code)
);

CREATE TABLE IF NOT EXISTS entity_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    entity_type attachment_entity_type NOT NULL,
    entity_id uuid NOT NULL,
    attachment_type_id uuid NOT NULL REFERENCES attachment_types(id) ON DELETE RESTRICT,
    file_url text NOT NULL,
    file_name varchar(255) NOT NULL,
    mime_type varchar(255) NOT NULL,
    file_size_bytes integer,
    note text,
    visible_to_client boolean NOT NULL DEFAULT false,
    uploaded_by uuid NOT NULL REFERENCES users(id),
    created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_requests_platform_entity_idx
    ON workflow_requests (platform_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS workflow_requests_status_idx
    ON workflow_requests (status);

CREATE INDEX IF NOT EXISTS workflow_requests_kind_idx
    ON workflow_requests (workflow_kind);

CREATE INDEX IF NOT EXISTS attachment_types_platform_sort_idx
    ON attachment_types (platform_id, sort_order);

CREATE INDEX IF NOT EXISTS entity_attachments_entity_idx
    ON entity_attachments (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS entity_attachments_type_idx
    ON entity_attachments (attachment_type_id);

CREATE INDEX IF NOT EXISTS entity_attachments_platform_idx
    ON entity_attachments (platform_id);

CREATE UNIQUE INDEX IF NOT EXISTS line_items_order_system_key_unique
    ON line_items (platform_id, order_id, system_key)
    WHERE order_id IS NOT NULL AND system_key IS NOT NULL AND is_voided = false;

CREATE UNIQUE INDEX IF NOT EXISTS line_items_inbound_system_key_unique
    ON line_items (platform_id, inbound_request_id, system_key)
    WHERE inbound_request_id IS NOT NULL AND system_key IS NOT NULL AND is_voided = false;

CREATE UNIQUE INDEX IF NOT EXISTS line_items_service_request_system_key_unique
    ON line_items (platform_id, service_request_id, system_key)
    WHERE service_request_id IS NOT NULL AND system_key IS NOT NULL AND is_voided = false;

INSERT INTO attachment_types (
    platform_id,
    code,
    label,
    allowed_entity_types,
    default_visible_to_client,
    sort_order
)
SELECT
    p.id,
    seed.code,
    seed.label,
    seed.allowed_entity_types,
    seed.default_visible_to_client,
    seed.sort_order
FROM platforms p
CROSS JOIN (
    VALUES
        (
            'PO_DOCUMENT',
            'PO Document',
            ARRAY['ORDER', 'INBOUND_REQUEST', 'SERVICE_REQUEST']::attachment_entity_type[],
            true,
            10
        ),
        (
            'PERMIT_DOCUMENT',
            'Permit Document',
            ARRAY['ORDER']::attachment_entity_type[],
            true,
            20
        ),
        (
            'ARTWORK_REFERENCE',
            'Artwork Reference',
            ARRAY['WORKFLOW_REQUEST', 'ORDER', 'INBOUND_REQUEST', 'SERVICE_REQUEST']::attachment_entity_type[],
            false,
            30
        ),
        (
            'GENERAL_SUPPORTING_DOCUMENT',
            'General Supporting Document',
            ARRAY['ORDER', 'INBOUND_REQUEST', 'SERVICE_REQUEST', 'WORKFLOW_REQUEST']::attachment_entity_type[],
            false,
            40
        )
) AS seed(code, label, allowed_entity_types, default_visible_to_client, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM attachment_types at
    WHERE at.platform_id = p.id
      AND at.code = seed.code
);

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
    JOIN companies c ON c.id = o.company_id
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
        client_price_visible
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
        false
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
