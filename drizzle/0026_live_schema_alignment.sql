CREATE TABLE IF NOT EXISTS access_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    code varchar(64) NOT NULL,
    name varchar(120) NOT NULL,
    description text,
    permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS access_policies_platform_code_unique
    ON access_policies (platform_id, code);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS access_policies_platform_role_idx
    ON access_policies (platform_id, role);
--> statement-breakpoint

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_policy_id uuid;
--> statement-breakpoint

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS permission_grants text[] NOT NULL DEFAULT ARRAY[]::text[];
--> statement-breakpoint

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS permission_revokes text[] NOT NULL DEFAULT ARRAY[]::text[];
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_access_policy_id_access_policies_id_fk'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_access_policy_id_access_policies_id_fk
            FOREIGN KEY (access_policy_id) REFERENCES access_policies(id) ON DELETE SET NULL;
    END IF;
END
$$;
--> statement-breakpoint

WITH policy_seeds AS (
    SELECT
        p.id AS platform_id,
        seed.code,
        seed.role,
        seed.name,
        seed.description,
        seed.permissions
    FROM platforms p
    CROSS JOIN (
        VALUES
            (
                'ADMIN_DEFAULT',
                'ADMIN'::user_role,
                'Admin Default',
                'Full default platform administration access',
                ARRAY[
                    'auth:*',
                    'users:*',
                    'companies:*',
                    'brands:*',
                    'countries:*',
                    'warehouses:*',
                    'zones:*',
                    'assets:*',
                    'collections:*',
                    'pricing:*',
                    'orders:*',
                    'invoices:*',
                    'scanning:*',
                    'inventory:*',
                    'conditions:*',
                    'lifecycle:*',
                    'notifications:*',
                    'analytics:*',
                    'calendar:*'
                ]::text[]
            ),
            (
                'LOGISTICS_DEFAULT',
                'LOGISTICS'::user_role,
                'Logistics Default',
                'Default logistics and warehouse operations access',
                ARRAY[
                    'auth:login',
                    'auth:reset_password',
                    'users:read',
                    'companies:read',
                    'brands:read',
                    'brands:create',
                    'brands:update',
                    'countries:read',
                    'warehouses:read',
                    'warehouses:create',
                    'warehouses:update',
                    'zones:read',
                    'zones:create',
                    'zones:update',
                    'zones:delete',
                    'assets:*',
                    'collections:*',
                    'orders:read',
                    'orders:update',
                    'orders:add_job_number',
                    'orders:add_time_windows',
                    'orders:view_status_history',
                    'orders:export',
                    'pricing:review',
                    'pricing:adjust',
                    'scanning:*',
                    'inventory:*',
                    'conditions:*',
                    'lifecycle:progress_status',
                    'lifecycle:receive_notifications',
                    'invoices:download',
                    'assets:check_availability',
                    'assets:availability_stats',
                    'assets:scan_history',
                    'calendar:read'
                ]::text[]
            ),
            (
                'CLIENT_DEFAULT',
                'CLIENT'::user_role,
                'Client Default',
                'Default client portal access',
                ARRAY[
                    'auth:login',
                    'auth:reset_password',
                    'companies:read',
                    'brands:read',
                    'countries:read',
                    'assets:read',
                    'collections:read',
                    'orders:create',
                    'orders:read',
                    'orders:update',
                    'orders:view_status_history',
                    'quotes:approve',
                    'quotes:decline',
                    'invoices:read',
                    'invoices:download',
                    'lifecycle:receive_notifications',
                    'assets:check_availability',
                    'assets:availability_stats',
                    'calendar:read'
                ]::text[]
            )
    ) AS seed(code, role, name, description, permissions)
)
INSERT INTO access_policies (platform_id, code, role, name, description, permissions, is_active)
SELECT
    seed.platform_id,
    seed.code,
    seed.role,
    seed.name,
    seed.description,
    seed.permissions,
    true
FROM policy_seeds seed
WHERE NOT EXISTS (
    SELECT 1
    FROM access_policies ap
    WHERE ap.platform_id = seed.platform_id
      AND ap.code = seed.code
);
--> statement-breakpoint

WITH user_target_policy AS (
    SELECT
        u.id,
        ap.id AS access_policy_id,
        COALESCE(u.permissions, ARRAY[]::text[]) AS legacy_permissions,
        COALESCE(ap.permissions, ARRAY[]::text[]) AS policy_permissions
    FROM users u
    JOIN access_policies ap
        ON ap.platform_id = u.platform
       AND ap.code = CASE
            WHEN u.permission_template = 'PLATFORM_ADMIN' OR u.role = 'ADMIN' THEN 'ADMIN_DEFAULT'
            WHEN u.permission_template = 'LOGISTICS_STAFF' OR u.role = 'LOGISTICS' THEN 'LOGISTICS_DEFAULT'
            ELSE 'CLIENT_DEFAULT'
       END
)
UPDATE users u
SET
    access_policy_id = target.access_policy_id,
    permission_grants = ARRAY(
        SELECT permission
        FROM (
            SELECT DISTINCT permission
            FROM unnest(target.legacy_permissions) AS permission
            EXCEPT
            SELECT DISTINCT permission
            FROM unnest(target.policy_permissions) AS permission
        ) grants
        ORDER BY permission
    ),
    permission_revokes = ARRAY(
        SELECT permission
        FROM (
            SELECT DISTINCT permission
            FROM unnest(target.policy_permissions) AS permission
            EXCEPT
            SELECT DISTINCT permission
            FROM unnest(target.legacy_permissions) AS permission
        ) revokes
        ORDER BY permission
    )
FROM user_target_policy target
WHERE u.id = target.id;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS workflow_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    code varchar(64) NOT NULL,
    label varchar(120) NOT NULL,
    description text,
    workflow_family varchar(64) NOT NULL,
    status_model_key varchar(64) NOT NULL,
    allowed_entity_types workflow_request_entity_type[] NOT NULL DEFAULT ARRAY[]::workflow_request_entity_type[],
    requester_roles user_role[] NOT NULL DEFAULT ARRAY['ADMIN','LOGISTICS']::user_role[],
    viewer_roles user_role[] NOT NULL DEFAULT ARRAY['ADMIN','LOGISTICS']::user_role[],
    actor_roles user_role[] NOT NULL DEFAULT ARRAY['ADMIN','LOGISTICS']::user_role[],
    priority_enabled boolean NOT NULL DEFAULT false,
    sla_hours integer,
    blocks_fulfillment_default boolean NOT NULL DEFAULT false,
    intake_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS workflow_definitions_platform_code_unique
    ON workflow_definitions (platform_id, code);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS workflow_definitions_platform_sort_idx
    ON workflow_definitions (platform_id, sort_order);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS workflow_definition_company_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    workflow_definition_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    is_enabled boolean NOT NULL,
    label_override varchar(120),
    sort_order_override integer,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS workflow_definition_company_override_unique
    ON workflow_definition_company_overrides (workflow_definition_id, company_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS workflow_definition_company_override_platform_idx
    ON workflow_definition_company_overrides (platform_id);
--> statement-breakpoint

ALTER TABLE workflow_requests
    ADD COLUMN IF NOT EXISTS workflow_definition_id uuid;
--> statement-breakpoint

ALTER TABLE workflow_requests
    ADD COLUMN IF NOT EXISTS workflow_code varchar(64);
--> statement-breakpoint

ALTER TABLE workflow_requests
    ADD COLUMN IF NOT EXISTS workflow_label varchar(120);
--> statement-breakpoint

ALTER TABLE workflow_requests
    ADD COLUMN IF NOT EXISTS workflow_family varchar(64);
--> statement-breakpoint

ALTER TABLE workflow_requests
    ADD COLUMN IF NOT EXISTS status_model_key varchar(64);
--> statement-breakpoint

ALTER TABLE workflow_requests
    ALTER COLUMN status TYPE varchar(64)
    USING status::text;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'workflow_requests_workflow_definition_id_workflow_definitions_id_fk'
    ) THEN
        ALTER TABLE workflow_requests
            ADD CONSTRAINT workflow_requests_workflow_definition_id_workflow_definitions_id_fk
            FOREIGN KEY (workflow_definition_id) REFERENCES workflow_definitions(id) ON DELETE RESTRICT;
    END IF;
END
$$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS workflow_requests_code_idx
    ON workflow_requests (workflow_code);
--> statement-breakpoint

WITH legacy_workflow_kinds AS (
    SELECT DISTINCT
        wr.platform_id,
        wr.workflow_kind
    FROM workflow_requests wr
    WHERE wr.workflow_kind IS NOT NULL
),
inserted_legacy_definitions AS (
    INSERT INTO workflow_definitions (
        platform_id,
        code,
        label,
        description,
        workflow_family,
        status_model_key,
        allowed_entity_types,
        requester_roles,
        viewer_roles,
        actor_roles,
        priority_enabled,
        sla_hours,
        blocks_fulfillment_default,
        intake_schema,
        is_active,
        sort_order
    )
    SELECT
        lwk.platform_id,
        lwk.workflow_kind::text,
        initcap(replace(lower(lwk.workflow_kind::text), '_', ' ')),
        'Migrated from legacy workflow kind ' || lwk.workflow_kind::text || '.',
        'simple_request',
        'simple_request',
        ARRAY['ORDER','INBOUND_REQUEST','SERVICE_REQUEST']::workflow_request_entity_type[],
        ARRAY['ADMIN','LOGISTICS']::user_role[],
        ARRAY['ADMIN','LOGISTICS']::user_role[],
        ARRAY['ADMIN','LOGISTICS']::user_role[],
        true,
        48,
        false,
        '{}'::jsonb,
        true,
        0
    FROM legacy_workflow_kinds lwk
    WHERE NOT EXISTS (
        SELECT 1
        FROM workflow_definitions wd
        WHERE wd.platform_id = lwk.platform_id
          AND wd.code = lwk.workflow_kind::text
    )
    RETURNING 1
)
INSERT INTO workflow_definitions (
    platform_id,
    code,
    label,
    description,
    workflow_family,
    status_model_key,
    allowed_entity_types,
    requester_roles,
    viewer_roles,
    actor_roles,
    priority_enabled,
    sla_hours,
    blocks_fulfillment_default,
    intake_schema,
    is_active,
    sort_order
)
SELECT
    p.id,
    'CREATIVE_SUPPORT',
    'Creative Support',
    'Request internal creative and design support for delivery prep.',
    'simple_request',
    'simple_request',
    ARRAY['ORDER','INBOUND_REQUEST','SERVICE_REQUEST']::workflow_request_entity_type[],
    ARRAY['ADMIN','LOGISTICS']::user_role[],
    ARRAY['ADMIN','LOGISTICS']::user_role[],
    ARRAY['ADMIN','LOGISTICS']::user_role[],
    true,
    48,
    false,
    '{}'::jsonb,
    true,
    0
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1
    FROM workflow_definitions wd
    WHERE wd.platform_id = p.id
);
--> statement-breakpoint

WITH preferred_definition AS (
    SELECT
        wr.id,
        COALESCE(
            legacy_def.id,
            fallback_def.id
        ) AS workflow_definition_id,
        COALESCE(
            legacy_def.code,
            fallback_def.code
        ) AS workflow_code,
        COALESCE(
            legacy_def.label,
            fallback_def.label
        ) AS workflow_label,
        COALESCE(
            legacy_def.workflow_family,
            fallback_def.workflow_family
        ) AS workflow_family,
        COALESCE(
            legacy_def.status_model_key,
            fallback_def.status_model_key
        ) AS status_model_key
    FROM workflow_requests wr
    LEFT JOIN workflow_definitions legacy_def
        ON legacy_def.platform_id = wr.platform_id
       AND legacy_def.code = wr.workflow_kind::text
    LEFT JOIN LATERAL (
        SELECT wd.*
        FROM workflow_definitions wd
        WHERE wd.platform_id = wr.platform_id
        ORDER BY wd.sort_order ASC, wd.label ASC
        LIMIT 1
    ) fallback_def ON true
)
UPDATE workflow_requests wr
SET
    workflow_definition_id = preferred.workflow_definition_id,
    workflow_code = preferred.workflow_code,
    workflow_label = preferred.workflow_label,
    workflow_family = preferred.workflow_family,
    status_model_key = preferred.status_model_key
FROM preferred_definition preferred
WHERE wr.id = preferred.id;
--> statement-breakpoint

ALTER TABLE workflow_requests
    ALTER COLUMN workflow_definition_id SET NOT NULL;
--> statement-breakpoint

ALTER TABLE workflow_requests
    ALTER COLUMN workflow_code SET NOT NULL;
--> statement-breakpoint

ALTER TABLE workflow_requests
    ALTER COLUMN workflow_label SET NOT NULL;
--> statement-breakpoint

ALTER TABLE workflow_requests
    ALTER COLUMN workflow_family SET NOT NULL;
--> statement-breakpoint

ALTER TABLE workflow_requests
    ALTER COLUMN status_model_key SET NOT NULL;
--> statement-breakpoint

ALTER TABLE attachment_types
    ADD COLUMN IF NOT EXISTS upload_roles user_role[] NOT NULL DEFAULT ARRAY[]::user_role[];
--> statement-breakpoint

ALTER TABLE attachment_types
    ADD COLUMN IF NOT EXISTS view_roles user_role[] NOT NULL DEFAULT ARRAY[]::user_role[];
--> statement-breakpoint

UPDATE attachment_types
SET upload_roles = ARRAY['ADMIN','LOGISTICS']::user_role[]
WHERE upload_roles IS NULL
   OR cardinality(upload_roles) = 0;
--> statement-breakpoint

UPDATE attachment_types
SET view_roles = CASE
    WHEN default_visible_to_client THEN ARRAY['ADMIN','LOGISTICS','CLIENT']::user_role[]
    ELSE ARRAY['ADMIN','LOGISTICS']::user_role[]
END
WHERE view_roles IS NULL
   OR cardinality(view_roles) = 0;
--> statement-breakpoint

INSERT INTO attachment_types (
    platform_id,
    code,
    label,
    allowed_entity_types,
    upload_roles,
    view_roles,
    default_visible_to_client,
    sort_order
)
SELECT
    p.id,
    seed.code,
    seed.label,
    seed.allowed_entity_types,
    seed.upload_roles,
    seed.view_roles,
    seed.default_visible_to_client,
    seed.sort_order
FROM platforms p
CROSS JOIN (
    VALUES
        (
            'SUPPORTING_DOCUMENT',
            'Supporting Document',
            ARRAY['ORDER','INBOUND_REQUEST','SERVICE_REQUEST']::attachment_entity_type[],
            ARRAY['ADMIN','LOGISTICS','CLIENT']::user_role[],
            ARRAY['ADMIN','LOGISTICS','CLIENT']::user_role[],
            true,
            0
        ),
        (
            'INTERNAL_REFERENCE',
            'Internal Reference',
            ARRAY['ORDER','INBOUND_REQUEST','SERVICE_REQUEST']::attachment_entity_type[],
            ARRAY['ADMIN','LOGISTICS']::user_role[],
            ARRAY['ADMIN','LOGISTICS']::user_role[],
            false,
            1
        ),
        (
            'WORKFLOW_SUPPORTING_DOCUMENT',
            'Workflow Supporting Document',
            ARRAY['WORKFLOW_REQUEST']::attachment_entity_type[],
            ARRAY['ADMIN','LOGISTICS']::user_role[],
            ARRAY['ADMIN','LOGISTICS']::user_role[],
            false,
            2
        )
) AS seed(
    code,
    label,
    allowed_entity_types,
    upload_roles,
    view_roles,
    default_visible_to_client,
    sort_order
)
WHERE NOT EXISTS (
    SELECT 1
    FROM attachment_types at
    WHERE at.platform_id = p.id
      AND at.code = seed.code
);
--> statement-breakpoint

ALTER TABLE notification_rules
    ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint

UPDATE notification_rules
SET conditions = '[]'::jsonb
WHERE conditions IS NULL;
--> statement-breakpoint

INSERT INTO notification_rules (
    platform_id,
    event_type,
    company_id,
    recipient_type,
    recipient_value,
    template_key,
    conditions,
    is_enabled,
    sort_order
)
SELECT
    p.id,
    seed.event_type,
    NULL,
    seed.recipient_type::recipient_type,
    seed.recipient_value,
    seed.template_key,
    '[]'::jsonb,
    true,
    seed.sort_order
FROM platforms p
CROSS JOIN (
    VALUES
        ('workflow_request.submitted', 'ROLE', 'ADMIN', 'workflow_request_submitted_admin', 0),
        ('workflow_request.submitted', 'ROLE', 'LOGISTICS', 'workflow_request_submitted_logistics', 1),
        ('workflow_request.status_changed', 'ROLE', 'ADMIN', 'workflow_request_status_changed_admin', 0),
        ('workflow_request.status_changed', 'ROLE', 'LOGISTICS', 'workflow_request_status_changed_logistics', 1),
        ('workflow_request.completed', 'ROLE', 'ADMIN', 'workflow_request_completed_admin', 0),
        ('workflow_request.completed', 'ROLE', 'LOGISTICS', 'workflow_request_completed_logistics', 1),
        ('workflow_request.cancelled', 'ROLE', 'ADMIN', 'workflow_request_cancelled_admin', 0),
        ('workflow_request.cancelled', 'ROLE', 'LOGISTICS', 'workflow_request_cancelled_logistics', 1)
) AS seed(event_type, recipient_type, recipient_value, template_key, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM notification_rules nr
    WHERE nr.platform_id = p.id
      AND nr.company_id IS NULL
      AND nr.event_type = seed.event_type
      AND nr.recipient_type = seed.recipient_type::recipient_type
      AND COALESCE(nr.recipient_value, '') = COALESCE(seed.recipient_value, '')
      AND nr.template_key = seed.template_key
);
