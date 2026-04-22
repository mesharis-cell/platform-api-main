-- Migration 0050 — prevent ROLE=CLIENT notification rules at the DB layer.
--
-- Follow-up to 0049's cross-tenant-leak fix. CLIENT users are company-scoped;
-- a notification_rules row with (recipient_type='ROLE', recipient_value='CLIENT')
-- causes the email handler's ROLE resolver to fan out to every client on the
-- platform (Red Bull + Pernod et al. share a platform). The canonical shape
-- for client-facing templates is recipient_type='ENTITY_OWNER' — the resolver
-- then reads the entity's created_by and targets that single user.
--
-- This CHECK constraint makes the bad shape physically uninsertable, so a
-- future migration, seed script, or hand-written SQL can't silently
-- reintroduce the leak. It complements the existing Zod validator in
-- notification-rules.schemas.ts which already blocks the shape at the admin
-- API layer.
--
-- Safety: migration 0049 already fixed every existing ROLE/CLIENT row to
-- ENTITY_OWNER/NULL — so adding the constraint now should find zero
-- violations and succeed immediately. Guarded with DO-block so re-runs are
-- no-ops.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notification_rules_role_not_client_chk'
    ) THEN
        ALTER TABLE notification_rules
            ADD CONSTRAINT notification_rules_role_not_client_chk
            CHECK (NOT (recipient_type = 'ROLE' AND recipient_value = 'CLIENT'));
    END IF;
END $$;
