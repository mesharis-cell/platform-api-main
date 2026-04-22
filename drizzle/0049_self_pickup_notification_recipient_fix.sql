-- Migration 0049 — fix cross-tenant leak in self-pickup client notifications.
--
-- Migration 0045 seeded client-facing SP notification rules with
-- recipient_type='ROLE' and recipient_value='CLIENT'. The email handler's
-- ROLE resolver fans out to EVERY user on the platform with that role, and
-- CLIENT users are company-scoped (Red Bull + Pernod clients on the same
-- platform). Result: Red Bull SP notifications (submitted, quoted, declined,
-- ready_for_pickup, return_due) fanned out to Pernod clients as well.
--
-- The correct shape is recipient_type='ENTITY_OWNER' with recipient_value=NULL
-- — the resolver then reads self_pickups.created_by → looks up the specific
-- submitting user's email → sends to them only. Same pattern orders/quotes
-- use for their client-facing templates in seed.ts. ADMIN and LOGISTICS
-- rules stay as ROLE (platform-wide visibility is correct for those roles).
--
-- Impact window on prod: from the moment 0045 was applied to this DB until
-- this migration lands. All existing mis-addressed notifications in
-- notification_logs are left in place as audit records (do not delete —
-- incident records).
--
-- Idempotent: UPDATE targets the exact bad shape and is a no-op once fixed.

UPDATE notification_rules
SET
    recipient_type = 'ENTITY_OWNER'::recipient_type,
    recipient_value = NULL,
    updated_at = NOW()
WHERE event_type LIKE 'self_pickup.%'
  AND recipient_type = 'ROLE'
  AND recipient_value = 'CLIENT';
