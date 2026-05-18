-- Migration: 0057_workflow_status_history_and_auto_open
--
-- Item 4 of the 9-item bundle. Adds:
--   1. workflow_request_status_history — audit trail of status transitions
--      so every change leaves a row recording from/to + actor + timestamp +
--      optional note.
--   2. workflow_definitions.auto_open_conditions jsonb — declarative
--      rule-matrix payload (null = manual creation only). Shape:
--        { trigger_event: 'ORDER_CONFIRMED' | ...,
--          conditions: [{ source, operator, value }] }
--      The evaluator runs after each declared trigger and auto-creates
--      matching workflow_requests on the parent entity.
--
-- No data backfill needed; all existing requests keep working unchanged.

CREATE TABLE IF NOT EXISTS "workflow_request_status_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflow_request_id" uuid NOT NULL REFERENCES "workflow_requests"("id") ON DELETE CASCADE,
    "from_status" varchar(50),
    "to_status" varchar(50) NOT NULL,
    "changed_by" uuid REFERENCES "users"("id"),
    "changed_at" timestamp NOT NULL DEFAULT now(),
    "note" text
);

CREATE INDEX IF NOT EXISTS "workflow_request_status_history_request_idx"
  ON "workflow_request_status_history" ("workflow_request_id");

CREATE INDEX IF NOT EXISTS "workflow_request_status_history_changed_at_idx"
  ON "workflow_request_status_history" ("changed_at");

ALTER TABLE "workflow_definitions"
  ADD COLUMN IF NOT EXISTS "auto_open_conditions" jsonb;
