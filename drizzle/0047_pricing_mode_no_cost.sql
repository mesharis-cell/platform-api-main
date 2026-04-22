-- Migration 0047 — pricing_mode enum + self_pickups.pricing_mode + NOT_APPLICABLE
--
-- Introduces the first-class "NO_COST" concept so admin/logistics can waive
-- pricing on a self-pickup without leaving zero-price line items cluttering
-- the UI. See plan file tender-knitting-avalanche.md for full context.
--
-- This migration is additive only. Existing rows default to:
--   self_pickups.pricing_mode = 'STANDARD'
-- and the new financial_status value 'NOT_APPLICABLE' is never set by this
-- migration — only by the new markAsNoCost service.
--
-- Generic enum name (pricing_mode, not self_pickup_pricing_mode) so the same
-- type can be reused by orders / inbound_requests / service_requests when
-- their columns land later.
--
-- All stages are idempotent — safe to re-apply.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: Create the pricing_mode enum type.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'pricing_mode'
    ) THEN
        CREATE TYPE "pricing_mode" AS ENUM ('STANDARD', 'NO_COST');
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: Add pricing_mode column to self_pickups.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "self_pickups"
    ADD COLUMN IF NOT EXISTS "pricing_mode" "pricing_mode" NOT NULL DEFAULT 'STANDARD';

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage C: Extend financial_status enum with NOT_APPLICABLE.
-- PostgreSQL ALTER TYPE ADD VALUE IF NOT EXISTS is non-destructive + preserves
-- all existing rows. Readers of financial_status (order-line-items services,
-- order.services, inbound-request.services) all use `.includes()` or ternary
-- fall-throughs, so adding a new value is breakage-free.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "financial_status" ADD VALUE IF NOT EXISTS 'NOT_APPLICABLE';
