-- Migration: 0073_drop_retired_pricing_columns
--
-- ⚠️ DESTRUCTIVE — drops eight columns across five tables. These columns were
--    made DORMANT across the pricing-ledger work (Phases 0–3): nothing in the
--    application code reads or writes them any more (verified by grep + the
--    same-commit code removal that ships with this migration). This is the
--    CONTRACT half of the expand-contract sequence.
--
-- Purpose: Retire the blanket-margin-override + SR-concession + warehouse-ops
--          pricing paths, superseded by the pricing ledger's single lever
--          (per-line line_items.sell_unit_rate) and the entity-agnostic
--          pricing_mode = NO_COST no-cost mechanism. Pricing-ledger Phase 4,
--          PLAN §7 (P4-2).
--
-- Columns dropped:
--   line_items.apply_margin              — per-line margin-policy override.
--                                          Engine stopped reading it in Phase 1
--                                          (sell = qty × sell_unit_rate now).
--   prices.margin_is_override            — blanket margin-override marker.
--   prices.margin_override_reason        — blanket margin-override reason.
--                                          Both stopped being written in Phase 1
--                                          (P1-6); projection returns constant
--                                          false/null for reader-shape stability.
--   service_requests.client_sell_override_total — SR concession sell-override.
--   service_requests.concession_reason          — SR concession reason.
--   service_requests.concession_approved_by      — SR concession approver (FK
--                                                   to users; the FK constraint
--                                                   drops with the column).
--   service_requests.concession_applied_at       — SR concession timestamp.
--                                          All four superseded by pricing_mode =
--                                          NO_COST (P1-8/P1-9). The
--                                          concession_approved_by_user relation
--                                          is removed from schema.ts in the same
--                                          commit.
--   companies.warehouse_ops_rate         — legacy BASE_OPS volume rate. BASE_OPS
--                                          was removed entirely in Phase 0; this
--                                          column went dormant then, dropped now.
--
-- Safety:  Every DROP uses IF EXISTS so a partial / repeated apply is safe. No
--          data is backfilled or moved — the retiring paths were already
--          migrated to their successors (Phase 1 SR concession row-migration in
--          0071; per-line sell stamping in 0072; BASE_OPS retire script in
--          Phase 0). Historical prices.breakdown_lines JSONB snapshots are NOT
--          touched (frozen financial records; the read path already tolerates
--          the legacy shape).
--
-- Rollback: re-adding the columns is trivial (nullable, no NOT NULL / default
--           needed for the override + concession columns; companies.warehouse_
--           ops_rate + line_items.apply_margin had defaults) but the DROPPED
--           DATA is not recoverable — none was live, so this is acceptable.
--           Test on staging first (house <migration_rules>).

-- ── Stage A · line_items ────────────────────────────────────────────────────
ALTER TABLE "line_items" DROP COLUMN IF EXISTS "apply_margin";

-- ── Stage B · prices ────────────────────────────────────────────────────────
ALTER TABLE "prices" DROP COLUMN IF EXISTS "margin_is_override";
ALTER TABLE "prices" DROP COLUMN IF EXISTS "margin_override_reason";

-- ── Stage C · service_requests (concession) ─────────────────────────────────
ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "client_sell_override_total";
ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "concession_reason";
ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "concession_approved_by";
ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "concession_applied_at";

-- ── Stage D · companies (warehouse ops) ─────────────────────────────────────
ALTER TABLE "companies" DROP COLUMN IF EXISTS "warehouse_ops_rate";
