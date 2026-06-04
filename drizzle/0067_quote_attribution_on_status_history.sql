-- 0067_quote_attribution_on_status_history
--
-- Persist quote on-behalf-of attribution on the status-history rows.
--
-- Today the "approved/declined by {manager} on behalf of {creator}" attribution is only
-- emitted to the event/email payload, never stored — so the order / self-pickup detail page
-- can't render it. This adds two nullable text columns to BOTH status-history tables so the
-- quote-action service can snapshot the actor + on-behalf-of names at transition time.
--
-- Both columns are nullable, no backfill needed: a NULL pair means a self/owner action (or a
-- pre-0067 row) and the frontend renders nothing extra. Self-healing forward — populated only
-- on company-scope quote actions going forward.
--
-- Hand-written per <migration_rules>; no snapshot. IF NOT EXISTS guards make re-apply safe.

ALTER TABLE "order_status_history"
    ADD COLUMN IF NOT EXISTS "acted_by_name" varchar(255);
ALTER TABLE "order_status_history"
    ADD COLUMN IF NOT EXISTS "on_behalf_of_name" varchar(255);

ALTER TABLE "self_pickup_status_history"
    ADD COLUMN IF NOT EXISTS "acted_by_name" varchar(255);
ALTER TABLE "self_pickup_status_history"
    ADD COLUMN IF NOT EXISTS "on_behalf_of_name" varchar(255);
