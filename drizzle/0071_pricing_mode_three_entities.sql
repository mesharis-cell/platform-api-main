-- Migration: 0071_pricing_mode_three_entities
--
-- Purpose: Extend the shared `pricing_mode` concept (enum introduced in 0047,
--          already on self_pickups) to the other three billing entities —
--          orders, inbound_requests, service_requests — so the "mark as
--          no-cost" gesture (PricingService.markEntityAsNoCost) can be wired
--          for all four entity types (pricing-ledger Phase 1, PLAN §4.1/§4.6).
--          ALSO migrates the retired SR "concession" rows onto the unified
--          NO_COST mode so the ledger has a single no-cost representation.
--
-- Scope:   orders / inbound_requests / service_requests (ADD COLUMN) +
--          a value-preserving row-migration on service_requests.
--          The `pricing_mode` enum type ALREADY EXISTS (0047) — no enum change,
--          so this is a single migration (no commit-first enum step needed).
--
-- Safety:  NON-DESTRUCTIVE. Additive columns default to 'STANDARD' (the
--          existing behaviour for every current row). The SR row-migration only
--          flips rows that ALREADY had a fully-applied zero-total concession
--          (client_sell_override_total = 0.00 AND concession_applied_at NOT
--          NULL) — those were already priced at zero, so NO_COST is a faithful
--          re-label, not a price change.
--          FULLY IDEMPOTENT — IF NOT EXISTS guards + the row-migration predicate
--          make re-runs a no-op.
--
-- Apply:   `APP_ENV=staging|production bunx drizzle-kit migrate` only
--          (hand-written; no drizzle-kit generate on this repo).

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: Add pricing_mode to the three entity tables (default STANDARD).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "orders"
    ADD COLUMN IF NOT EXISTS "pricing_mode" "pricing_mode" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "inbound_requests"
    ADD COLUMN IF NOT EXISTS "pricing_mode" "pricing_mode" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "service_requests"
    ADD COLUMN IF NOT EXISTS "pricing_mode" "pricing_mode" NOT NULL DEFAULT 'STANDARD';

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: Migrate retired SR concession rows onto NO_COST.
-- A concession that was applied (concession_applied_at NOT NULL) with a zero
-- client override total (client_sell_override_total = 0.00) is exactly the
-- "no-cost" state under the new model. Flip those rows so the unified NO_COST
-- path owns them; the legacy concession_* / client_sell_override_total columns
-- stay dormant-but-present until the Phase 4 cleanup migration (expand-contract).
-- Idempotent: rows already at NO_COST are unaffected; predicate is stable.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "service_requests"
SET "pricing_mode" = 'NO_COST'
WHERE "client_sell_override_total" = '0.00'
  AND "concession_applied_at" IS NOT NULL
  AND "pricing_mode" <> 'NO_COST';
