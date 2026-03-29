-- Idempotent: add default notification rule for logistics → admin pricing review.
-- Safe for production: INSERT … SELECT with NOT EXISTS; does not modify existing rows.

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
    'order.pending_approval',
    NULL,
    'ROLE'::recipient_type,
    'ADMIN',
    'order_pending_approval_admin',
    '[]'::jsonb,
    true,
    0,
    NOW(),
    NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1
    FROM notification_rules nr
    WHERE nr.platform_id = p.id
      AND nr.event_type = 'order.pending_approval'
      AND nr.company_id IS NULL
      AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN'
      AND nr.template_key = 'order_pending_approval_admin'
);
