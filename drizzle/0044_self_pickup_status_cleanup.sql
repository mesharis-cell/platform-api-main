-- Migration 0044 — self-pickup status enum cleanup + decline_reason column.
--
-- Removes IN_USE and RETURNED from self_pickup_status. Both values were
-- declared in the enum but had no entry points in the codebase: no endpoint,
-- no UI action, and no cron job transitions a self-pickup into either state.
-- The real flow is PICKED_UP → AWAITING_RETURN → CLOSED. This cleanup deletes
-- the dead values so rule-matching, templates, and type safety stop carrying
-- orphan cases.
--
-- Also adds decline_reason TEXT column to self_pickups to persist the client's
-- reason when they decline a quote (mirrors orders.decline_reason).
--
-- Pre-alpha for self-pickup — no production data yet — but migration is
-- defensive: stages A/A' count any rows still on orphan statuses and raise
-- loudly so nothing silently disappears.
--
-- PostgreSQL does not support DROP VALUE on enums; we use the rename-old /
-- create-new / swap-column-type / drop-old pattern.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: Safety check — fail loudly if deprecated values still hold rows.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    orphan_pickups integer;
    orphan_history integer;
BEGIN
    SELECT COUNT(*) INTO orphan_pickups
    FROM self_pickups
    WHERE self_pickup_status::text IN ('IN_USE', 'RETURNED');

    IF orphan_pickups > 0 THEN
        RAISE EXCEPTION
            'Cannot run migration 0044: % self_pickups rows still on IN_USE/RETURNED status. Resolve (remap to AWAITING_RETURN or CLOSED) before rerunning.', orphan_pickups;
    END IF;

    SELECT COUNT(*) INTO orphan_history
    FROM self_pickup_status_history
    WHERE status::text IN ('IN_USE', 'RETURNED');

    IF orphan_history > 0 THEN
        RAISE NOTICE
            'self_pickup_status_history contains % rows with IN_USE/RETURNED status. These are frozen audit records; rewriting them to CLOSED for enum compatibility.', orphan_history;
        -- Audit-level remap: old history rows get rewritten to CLOSED so the enum
        -- swap succeeds. This is documented noise, not data loss.
        UPDATE self_pickup_status_history
        SET status = 'CLOSED'::self_pickup_status
        WHERE status::text IN ('IN_USE', 'RETURNED');
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: Rename the old enum type out of the way.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "self_pickup_status" RENAME TO "self_pickup_status_old";

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage C: Create the new enum with 11 values (IN_USE + RETURNED removed).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "self_pickup_status" AS ENUM (
    'SUBMITTED',
    'PRICING_REVIEW',
    'PENDING_APPROVAL',
    'QUOTED',
    'DECLINED',
    'CONFIRMED',
    'READY_FOR_PICKUP',
    'PICKED_UP',
    'AWAITING_RETURN',
    'CLOSED',
    'CANCELLED'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage D: Swap column types on self_pickups + self_pickup_status_history.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "self_pickups"
    ALTER COLUMN "self_pickup_status" DROP DEFAULT;

ALTER TABLE "self_pickups"
    ALTER COLUMN "self_pickup_status" TYPE "self_pickup_status"
        USING ("self_pickup_status"::text::"self_pickup_status");

ALTER TABLE "self_pickups"
    ALTER COLUMN "self_pickup_status" SET DEFAULT 'SUBMITTED';

ALTER TABLE "self_pickup_status_history"
    ALTER COLUMN "status" TYPE "self_pickup_status"
        USING ("status"::text::"self_pickup_status");

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage E: Drop the old enum type.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TYPE "self_pickup_status_old";

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage F: Add decline_reason column.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "self_pickups"
    ADD COLUMN IF NOT EXISTS "decline_reason" text;
