ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE notification_logs
    ADD COLUMN IF NOT EXISTS next_attempt_at timestamp,
    ADD COLUMN IF NOT EXISTS processing_started_at timestamp,
    ADD COLUMN IF NOT EXISTS worker_id varchar(255);

UPDATE notification_logs
SET next_attempt_at = COALESCE(last_attempt_at, created_at)
WHERE next_attempt_at IS NULL
  AND status IN ('QUEUED', 'RETRYING');

CREATE INDEX IF NOT EXISTS notification_logs_queue_idx
    ON notification_logs (status, next_attempt_at, created_at);
