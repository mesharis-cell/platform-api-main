-- Migration: 0066_self_pickup_updated_rules
--
-- Order Editing — Phase 4 (Self-Pickup). Seed default `self_pickup.updated` notification rules
-- for existing platforms: ADMIN + LOGISTICS, gated on `status_reverted = true` (the re-review
-- trigger fired when a Tier C / item edit bounces a quoted self-pickup back to PRICING_REVIEW).
-- No client rule (the client is informed via the existing quote flow on re-issue).
--
-- Idempotent (NOT EXISTS guard). No DDL — `self_pickup.updated` events ride system_events.

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
            'self_pickup.updated',
            'ROLE',
            'ADMIN',
            'self_pickup_updated_admin',
            '[{"field":"status_reverted","operator":"equals","value":"true"}]',
            0
        ),
        (
            'self_pickup.updated',
            'ROLE',
            'LOGISTICS',
            'self_pickup_updated_admin',
            '[{"field":"status_reverted","operator":"equals","value":"true"}]',
            1
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
