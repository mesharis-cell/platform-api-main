-- Migration: 0060_seed_permit_handling_workflow
--
-- Seeds the PERMIT_HANDLING workflow definition on every existing
-- platform. This is the canonical client-facing workflow that auto-opens
-- on ORDER_CONFIRMED when the client picked "I'll handle the permit" at
-- checkout (item 7 + item 4 of the 9-item bundle). Without this seed,
-- items 3 and 4's new client-portal surfaces are dormant — the existing
-- internal "Creative Support" workflow has CLIENT excluded from roles, so
-- nothing surfaces in the client portal.
--
-- Idempotent — only inserts where (platform_id, code) doesn't already
-- exist, so re-running on a partially seeded platform is safe.

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
    auto_open_conditions,
    is_active,
    sort_order,
    created_at,
    updated_at
)
SELECT
    p.id,
    'PERMIT_HANDLING',
    'Venue Permit Coordination',
    'Auto-opens when a client picks ''I''ll handle the permit'' at checkout. Client uploads the permit, ops reviews, and the order is blocked from progressing past CONFIRMED until the workflow completes.',
    'document_collection',
    'document_collection',
    ARRAY['ORDER']::workflow_request_entity_type[],
    ARRAY['CLIENT','ADMIN']::user_role[],
    ARRAY['CLIENT','ADMIN','LOGISTICS']::user_role[],
    ARRAY['CLIENT','ADMIN']::user_role[],
    false,
    72,
    true,
    '{
        "fields": [
            {"key": "permit_reference", "label": "Permit reference number", "type": "text", "required": false},
            {"key": "issue_date", "label": "Permit issue date", "type": "date", "required": false}
        ]
    }'::jsonb,
    '{
        "trigger_event": "ORDER_CONFIRMED",
        "conditions": [
            {"source": "permit_requirements.permit_owner", "operator": "equals", "value": "CLIENT"}
        ]
    }'::jsonb,
    true,
    100,
    now(),
    now()
FROM platforms p
WHERE NOT EXISTS (
    SELECT 1 FROM workflow_definitions wd
    WHERE wd.platform_id = p.id AND wd.code = 'PERMIT_HANDLING'
);
