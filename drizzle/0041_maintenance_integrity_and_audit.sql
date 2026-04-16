-- Migration 0041 — maintenance-mode integrity + audit trail
--
-- 1) FK on platforms.maintenance_updated_by → users(id) so we can't lose
--    provenance when a super-admin user is deleted. ON DELETE SET NULL
--    because the audit trail (from 2) preserves the historical actor_id.
--
-- 2) platform_maintenance_audit — append-only log of every toggle. One row
--    per PATCH to /super-admin/platforms/:id/maintenance. Who, when, what.
--    Enables ops to answer "why was this platform taken down at 14:00?"
--    without archaeology.
--
-- Additive only. No backfill for the FK — existing rows with a non-null
-- maintenance_updated_by already point at real user IDs (we just start
-- enforcing it from now).

-- 1) FK on maintenance_updated_by
ALTER TABLE "platforms"
    ADD CONSTRAINT "platforms_maintenance_updated_by_users_id_fk"
    FOREIGN KEY ("maintenance_updated_by")
    REFERENCES "users"("id")
    ON DELETE SET NULL;

-- 2) Maintenance audit table
CREATE TABLE IF NOT EXISTS "platform_maintenance_audit" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "platform_id" uuid NOT NULL REFERENCES "platforms"("id") ON DELETE CASCADE,
    "action" varchar(16) NOT NULL, -- "ENABLED" | "UPDATED" | "DISABLED"
    "message" text,
    "until" timestamp,
    "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "platform_maintenance_audit_platform_id_idx"
    ON "platform_maintenance_audit" ("platform_id", "created_at" DESC);
