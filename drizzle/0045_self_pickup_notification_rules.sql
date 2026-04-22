-- Migration 0045 — self-pickup notification rule coverage + condition-filter cleanup.
--
-- Seeds direct event-keyed notification rules for every self-pickup lifecycle
-- event so the email handler's rule lookup returns rows instead of none. Also
-- retires any condition-filtered rules on SELF_PICKUP_STATUS_CHANGED that a
-- sibling migration (0043_notification_rules_coverage) may have introduced as
-- a bandaid while the services were still emitting only generic events.
--
-- Context: SP1 of the self-pickup parity sprint refactored the services so
-- every status transition emits the specific event type alongside the generic
-- STATUS_CHANGED. Direct event-keyed rules are now the right shape; condition
-- filters on payload.new_status would fire a second duplicate email.
--
-- Templates are already wired in api/src/app/events/templates/index.ts:216-229.
-- Idempotent: INSERT … WHERE NOT EXISTS per rule; DELETE targets rows that
-- may or may not exist. Safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: Clean up any condition-filtered rules keyed on STATUS_CHANGED for
-- statuses we now emit specific events for. This is the retirement step for
-- 0043's bandaid rules — no-op if 0043 hasn't landed yet.
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM notification_rules
WHERE event_type = 'self_pickup.status_changed'
  AND conditions::jsonb @> ANY (ARRAY[
    '[{"field":"new_status","op":"equals","value":"QUOTED"}]'::jsonb,
    '[{"field":"new_status","op":"equals","value":"DECLINED"}]'::jsonb,
    '[{"field":"new_status","op":"equals","value":"CONFIRMED"}]'::jsonb,
    '[{"field":"new_status","op":"equals","value":"READY_FOR_PICKUP"}]'::jsonb,
    '[{"field":"new_status","op":"equals","value":"AWAITING_RETURN"}]'::jsonb,
    '[{"field":"new_status","op":"equals","value":"CANCELLED"}]'::jsonb
  ]);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: Seed direct event-keyed rules — one row per (platform × template).
-- Per-platform fan-out ensures multi-tenant platforms each get the defaults.
-- ═══════════════════════════════════════════════════════════════════════════

-- Template: self_pickup_submitted_client (CLIENT role)
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.submitted', NULL, 'ROLE'::recipient_type, 'CLIENT',
       'self_pickup_submitted_client', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.submitted'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'CLIENT' AND nr.template_key = 'self_pickup_submitted_client'
);

-- Template: self_pickup_submitted_admin
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.submitted', NULL, 'ROLE'::recipient_type, 'ADMIN',
       'self_pickup_submitted_admin', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.submitted'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN' AND nr.template_key = 'self_pickup_submitted_admin'
);

-- Template: self_pickup_submitted_logistics
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.submitted', NULL, 'ROLE'::recipient_type, 'LOGISTICS',
       'self_pickup_submitted_logistics', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.submitted'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'LOGISTICS'
      AND nr.template_key = 'self_pickup_submitted_logistics'
);

-- Template: self_pickup_quoted_client
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.quoted', NULL, 'ROLE'::recipient_type, 'CLIENT',
       'self_pickup_quoted_client', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.quoted'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'CLIENT' AND nr.template_key = 'self_pickup_quoted_client'
);

-- Template: self_pickup_declined_client
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.declined', NULL, 'ROLE'::recipient_type, 'CLIENT',
       'self_pickup_declined_client', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.declined'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'CLIENT' AND nr.template_key = 'self_pickup_declined_client'
);

-- Template: self_pickup_declined_admin
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.declined', NULL, 'ROLE'::recipient_type, 'ADMIN',
       'self_pickup_declined_admin', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.declined'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN' AND nr.template_key = 'self_pickup_declined_admin'
);

-- Template: self_pickup_confirmed_admin
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.confirmed', NULL, 'ROLE'::recipient_type, 'ADMIN',
       'self_pickup_confirmed_admin', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.confirmed'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN' AND nr.template_key = 'self_pickup_confirmed_admin'
);

-- Template: self_pickup_confirmed_logistics
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.confirmed', NULL, 'ROLE'::recipient_type, 'LOGISTICS',
       'self_pickup_confirmed_logistics', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.confirmed'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'LOGISTICS'
      AND nr.template_key = 'self_pickup_confirmed_logistics'
);

-- Template: self_pickup_ready_client
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.ready_for_pickup', NULL, 'ROLE'::recipient_type, 'CLIENT',
       'self_pickup_ready_client', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.ready_for_pickup'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'CLIENT' AND nr.template_key = 'self_pickup_ready_client'
);

-- Template: self_pickup_picked_up_admin
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.picked_up', NULL, 'ROLE'::recipient_type, 'ADMIN',
       'self_pickup_picked_up_admin', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.picked_up'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN' AND nr.template_key = 'self_pickup_picked_up_admin'
);

-- Template: self_pickup_return_due_client
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.return_due', NULL, 'ROLE'::recipient_type, 'CLIENT',
       'self_pickup_return_due_client', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.return_due'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'CLIENT' AND nr.template_key = 'self_pickup_return_due_client'
);

-- Template: self_pickup_return_due_logistics
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.return_due', NULL, 'ROLE'::recipient_type, 'LOGISTICS',
       'self_pickup_return_due_logistics', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.return_due'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'LOGISTICS'
      AND nr.template_key = 'self_pickup_return_due_logistics'
);

-- Template: self_pickup_closed_admin
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.closed', NULL, 'ROLE'::recipient_type, 'ADMIN',
       'self_pickup_closed_admin', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.closed'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN' AND nr.template_key = 'self_pickup_closed_admin'
);

-- Template: self_pickup_cancelled_admin
INSERT INTO notification_rules (
    platform_id, event_type, company_id, recipient_type, recipient_value,
    template_key, conditions, is_enabled, sort_order, created_at, updated_at
)
SELECT p.id, 'self_pickup.cancelled', NULL, 'ROLE'::recipient_type, 'ADMIN',
       'self_pickup_cancelled_admin', '[]'::jsonb, true, 0, NOW(), NOW()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM notification_rules nr
    WHERE nr.platform_id = p.id AND nr.event_type = 'self_pickup.cancelled'
      AND nr.company_id IS NULL AND nr.recipient_type = 'ROLE'
      AND nr.recipient_value = 'ADMIN' AND nr.template_key = 'self_pickup_cancelled_admin'
);
