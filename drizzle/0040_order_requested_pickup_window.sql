-- Migration 0040 — add requested_pickup_window to orders
--
-- Companion to requested_delivery_window (added in 0038). Client-requested
-- collection/pickup window — when the client wants the items picked up
-- after the event. Separate from the logistics-authoritative pickup_window.
-- Immutable after submit (never trampled by logistics — ops edits the
-- authoritative `pickup_window` column instead).
--
-- Additive only, nullable. No backfill.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "requested_pickup_window" jsonb;
