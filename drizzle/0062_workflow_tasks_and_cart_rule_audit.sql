-- Migration: 0062_workflow_tasks_and_cart_rule_audit
--
-- Adds durable audit rows for advisory cart-rule warnings, aligns existing
-- asset-targeted rules to the target asset company, and makes the seeded
-- permit workflow non-blocking + order-submit-triggered.
--
-- No destructive steps.

CREATE TABLE IF NOT EXISTS commerce_rule_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    entity_type workflow_request_entity_type NOT NULL,
    entity_id uuid NOT NULL,
    rule_id uuid REFERENCES commerce_rules(id) ON DELETE SET NULL,
    rule_name varchar(200) NOT NULL,
    rule_type commerce_rule_type NOT NULL,
    severity commerce_rule_severity NOT NULL,
    message text NOT NULL,
    related_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
    acknowledged boolean NOT NULL DEFAULT false,
    acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at timestamp,
    cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
    hit_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT commerce_rule_ack_entity_type_check CHECK (entity_type IN ('ORDER', 'SELF_PICKUP'))
);

CREATE INDEX IF NOT EXISTS commerce_rule_ack_parent_idx
    ON commerce_rule_acknowledgements (platform_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS commerce_rule_ack_rule_idx
    ON commerce_rule_acknowledgements (rule_id);

-- Existing asset-targeted rules were authored through UI language that called
-- NULL company_id "platform-wide". Product intent is now asset-company-only.
UPDATE commerce_rules cr
SET company_id = a.company_id,
    updated_at = now()
FROM assets a
WHERE cr.company_id IS NULL
  AND cr.target ->> 'kind' = 'ASSET'
  AND cr.target ->> 'asset_id' = a.id::text
  AND cr.platform_id = a.platform_id
  AND a.company_id IS NOT NULL;

-- Workflow tasks are advisory/action-required UX, not fulfillment gates.
UPDATE workflow_definitions
SET blocks_fulfillment_default = false,
    auto_open_conditions = jsonb_set(
        COALESCE(auto_open_conditions, '{}'::jsonb),
        '{trigger_event}',
        to_jsonb('ORDER_SUBMITTED'::text),
        true
    ),
    description = CASE
        WHEN code = 'PERMIT_HANDLING' THEN
            'Auto-opens when a client picks ''I''ll handle the permit'' at checkout. Client uploads permit documents, ops reviews, and the task remains advisory/action-required without blocking order progression.'
        ELSE description
    END,
    updated_at = now()
WHERE code = 'PERMIT_HANDLING';

INSERT INTO notification_rules (
    platform_id,
    event_type,
    company_id,
    recipient_type,
    recipient_value,
    template_key,
    conditions,
    is_enabled,
    sort_order,
    created_at,
    updated_at
)
SELECT
    p.id,
    v.event_type,
    NULL,
    v.recipient_type::recipient_type,
    v.recipient_value,
    v.template_key,
    v.conditions::jsonb,
    true,
    v.sort_order,
    now(),
    now()
FROM platforms p
CROSS JOIN (
    VALUES
        (
            'workflow_request.submitted',
            'ENTITY_OWNER',
            NULL,
            'workflow_request_action_required_client',
            '[{"field":"client_action_required","operator":"equals","value":"true"}]',
            2
        ),
        (
            'workflow_request.status_changed',
            'ENTITY_OWNER',
            NULL,
            'workflow_request_action_required_client',
            '[{"field":"client_action_required","operator":"equals","value":"true"}]',
            2
        ),
        (
            'workflow_request.completed',
            'ENTITY_OWNER',
            NULL,
            'workflow_request_completed_client',
            '[{"field":"client_visible","operator":"equals","value":"true"}]',
            2
        )
) AS v(event_type, recipient_type, recipient_value, template_key, conditions, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM notification_rules nr
    WHERE nr.platform_id = p.id
      AND nr.company_id IS NULL
      AND nr.event_type = v.event_type
      AND nr.recipient_type = v.recipient_type::recipient_type
      AND nr.recipient_value IS NOT DISTINCT FROM v.recipient_value
      AND nr.template_key = v.template_key
);
