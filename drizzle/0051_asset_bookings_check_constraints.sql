-- Migration 0051 — defensive CHECK constraints on asset_bookings.
--
-- Two invariants that the application enforces today but the DB does not:
--   1. quantity > 0 — a booking for zero or negative units is meaningless;
--      it would silently never reduce availability and would corrupt the
--      family-stats counter.
--   2. blocked_from <= blocked_until — a window where the end is before the
--      start is nonsense and would break the overlap-check math in
--      availability.core.ts (`blocked_from <= window.end AND blocked_until
--      >= window.start`).
--
-- These constraints are belt-and-braces: app logic should already produce
-- valid rows. Adding them at the DB layer makes any future regression fail
-- loud at INSERT time instead of silently producing inconsistent inventory.
--
-- Lands as part of the Phase 1 latent-fix bundle that prepares the platform
-- for the submit-time-booking move (orders will join self-pickups in
-- creating asset_bookings at the moment of submit). Catching invalid rows
-- early is cheaper than diagnosing them after the timing flip.
--
-- Safety: a quick scan of staging + production data should reveal no
-- violations. If any are found at apply time, those rows must be cleaned
-- up first (likely by hand) — but the codebase emits no path that would
-- generate them, so a clean apply is expected. Guarded with DO-blocks so
-- re-runs are no-ops.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'asset_bookings_quantity_positive_chk'
    ) THEN
        ALTER TABLE asset_bookings
            ADD CONSTRAINT asset_bookings_quantity_positive_chk
            CHECK (quantity > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'asset_bookings_window_valid_chk'
    ) THEN
        ALTER TABLE asset_bookings
            ADD CONSTRAINT asset_bookings_window_valid_chk
            CHECK (blocked_from <= blocked_until);
    END IF;
END $$;
