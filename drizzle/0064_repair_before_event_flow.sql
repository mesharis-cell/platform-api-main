-- Migration: 0064_repair_before_event_flow
--
-- Adds durable state for the order-item "Repair before event" flow:
-- - Admin-only fulfillment exceptions on blocking service requests.
-- - Client-requested maintenance decision changes before quote acceptance.
-- - Default grouped repair-before-event notification rules for existing platforms.
--
-- No destructive steps.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'maintenance_decision_change_request_status'
    ) THEN
        CREATE TYPE maintenance_decision_change_request_status AS ENUM (
            'PENDING',
            'APPROVED',
            'REJECTED',
            'CANCELLED'
        );
    END IF;
END $$;

ALTER TABLE service_requests
    ADD COLUMN IF NOT EXISTS fulfillment_override_reason text,
    ADD COLUMN IF NOT EXISTS fulfillment_override_approved_by uuid REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS fulfillment_override_applied_at timestamp;

CREATE INDEX IF NOT EXISTS service_requests_fulfillment_override_idx
    ON service_requests (fulfillment_override_applied_at)
    WHERE fulfillment_override_applied_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS maintenance_decision_change_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES users(id),
    requested_decision maintenance_decision NOT NULL,
    current_decision maintenance_decision,
    status maintenance_decision_change_request_status NOT NULL DEFAULT 'PENDING',
    rejection_reason text,
    resolved_by uuid REFERENCES users(id),
    resolved_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_decision_change_requests_platform_idx
    ON maintenance_decision_change_requests (platform_id);

CREATE INDEX IF NOT EXISTS maintenance_decision_change_requests_order_idx
    ON maintenance_decision_change_requests (order_id);

CREATE INDEX IF NOT EXISTS maintenance_decision_change_requests_item_idx
    ON maintenance_decision_change_requests (order_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_decision_change_requests_one_pending_per_item_idx
    ON maintenance_decision_change_requests (order_item_id)
    WHERE status = 'PENDING';

INSERT INTO notification_rules (
    platform_id,
    event_type,
    company_id,
    recipient_type,
    recipient_value,
    template_key,
    sort_order
)
SELECT
    p.id,
    seed.event_type,
    NULL,
    seed.recipient_type::recipient_type,
    seed.recipient_value,
    seed.template_key,
    seed.sort_order
FROM platforms p
CROSS JOIN (
    VALUES
        ('order.repair_before_event_required', 'ROLE', 'ADMIN', 'repair_before_event_admin', 0),
        ('order.repair_before_event_required', 'ROLE', 'LOGISTICS', 'repair_before_event_logistics', 1),
        ('order.maintenance_decision_change_requested', 'ROLE', 'ADMIN', 'maintenance_decision_change_requested_admin', 0)
) AS seed(event_type, recipient_type, recipient_value, template_key, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM notification_rules nr
    WHERE nr.platform_id = p.id
      AND nr.event_type = seed.event_type
      AND nr.company_id IS NULL
      AND nr.recipient_type = seed.recipient_type::recipient_type
      AND nr.recipient_value = seed.recipient_value
      AND nr.template_key = seed.template_key
);
