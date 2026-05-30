-- Migration: 0065_entity_change_history_and_order_updated
--
-- Order Editing — Phase 1 DB surface.
--
-- Stage A: entity_change_history — polymorphic, field-level audit ledger for entity edits
--          (orders, inbound_requests, service_requests, self_pickups). One row per changed
--          allowlisted field, written inside the edit transaction. Mirrors the system_events
--          polymorphic convention (entity_type + entity_id, NO hard FK to the entity).
--
-- Stage B: seed default `order.updated` notification rules for existing platforms — ADMIN +
--          LOGISTICS, gated on `status_reverted = true` (the re-review trigger fired when a
--          Tier B/C edit bounces an order back to PRICING_REVIEW). NO client rule: the client
--          is informed via the existing quote-ready flow when admin re-issues the quote, not on
--          the edit itself. Rules are dormant until Phase 2 makes `status_reverted` possible.
--
-- No destructive steps. Idempotent (IF NOT EXISTS + NOT EXISTS guards).

-- ============================ Stage A: entity_change_history =============================

CREATE TABLE IF NOT EXISTS "entity_change_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL REFERENCES "platforms"("id") ON DELETE CASCADE,
    "entity_type" "entity_type" NOT NULL,
    "entity_id" uuid NOT NULL,
    "entity_id_readable" varchar(50),
    "field" varchar(100) NOT NULL,
    "old_value" jsonb,
    "new_value" jsonb,
    "change_tier" varchar(1),
    "changed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "changed_by_role" varchar(20),
    "acted_by_name" varchar(255),
    "on_behalf_of_name" varchar(255),
    "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "entity_change_history_entity_idx"
    ON "entity_change_history" ("entity_type", "entity_id", "created_at");
CREATE INDEX IF NOT EXISTS "entity_change_history_platform_idx"
    ON "entity_change_history" ("platform_id");
CREATE INDEX IF NOT EXISTS "entity_change_history_changed_by_idx"
    ON "entity_change_history" ("changed_by");

-- ====================== Stage B: seed order.updated notification rules ====================

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
            'order.updated',
            'ROLE',
            'ADMIN',
            'order_updated_admin',
            '[{"field":"status_reverted","operator":"equals","value":"true"}]',
            0
        ),
        (
            'order.updated',
            'ROLE',
            'LOGISTICS',
            'order_updated_admin',
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
