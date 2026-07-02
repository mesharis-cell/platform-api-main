-- Migration: 0070_sell_unit_rate
--
-- Purpose: Add per-line SELL price override column `sell_unit_rate` to `line_items`.
--          Phase 1 of the per-line sell-override feature — schema only, no behavior wiring.
--          NULL (the default state) = inherit today's margin math
--          (sell = buy * (1 + entity margin%), or buy when apply_margin is off).
--          When ADMIN sets a value, sell_total = quantity * sell_unit_rate, bypassing
--          the margin formula. Mirrors `unit_rate` type exactly: numeric(10,2), nullable.
--
-- Scope:   `line_items` table ONLY. Additive column, no backfill, no NOT NULL, no default.
--
-- Safety:  NON-DESTRUCTIVE — pure additive DDL (ADD COLUMN IF NOT EXISTS).
--          FULLY IDEMPOTENT — IF NOT EXISTS guard makes re-runs a no-op.
--          No data change, no enum change, no constraint change.
--
-- Apply:   `APP_ENV=staging|production bunx drizzle-kit migrate` only (hand-written; no generate).

ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "sell_unit_rate" numeric(10, 2);
