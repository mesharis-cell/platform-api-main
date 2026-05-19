-- Migration: 0063_workflow_cart_rule_staging_polish
--
-- Canonicalizes the seeded permit workflow after staging smoke tests exposed
-- frontend/API shape drift around auto_open_conditions.
--
-- No destructive steps.

UPDATE workflow_definitions
SET auto_open_conditions = '{
        "trigger_event": "ORDER_SUBMITTED",
        "conditions": [
            {"source": "permit_requirements.requires_permit", "operator": "truthy"},
            {"source": "permit_requirements.permit_owner", "operator": "equals", "value": "CLIENT"}
        ]
    }'::jsonb,
    blocks_fulfillment_default = false,
    description = 'Auto-opens when a client picks ''I''ll handle the permit'' at checkout. Client uploads permit documents, ops reviews, and the task remains advisory/action-required without blocking order progression.',
    updated_at = now()
WHERE code = 'PERMIT_HANDLING';
