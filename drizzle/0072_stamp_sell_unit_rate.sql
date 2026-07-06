-- Migration: 0072_stamp_sell_unit_rate
--
-- Purpose: Value-preserving backfill that stamps an explicit `sell_unit_rate`
--          on every existing BILLABLE, non-SYSTEM, non-voided line item whose
--          rate is still NULL, so the pricing engine can move from the old
--          total-level margin math to the per-line ledger model
--          (sell = qty × sell_unit_rate). Pricing-ledger Phase 1, PLAN §4.2.
--
-- Formula (MIRRORS pricing.service.ts buildBreakdownLinesFromLineItems'
--          effective-apply_margin resolution EXACTLY):
--            effective apply_margin is FALSE  ⇔  li.apply_margin IS FALSE
--                                                 OR (li.apply_margin IS NULL
--                                                     AND service_type.apply_margin IS FALSE)
--            pass-through (effective FALSE) → sell_unit_rate = unit_rate
--            margin      (effective TRUE)   → sell_unit_rate =
--                                             ROUND(unit_rate * (1 + margin/100), 2)
--          where `margin` is the entity's prices.margin_percent (the seed the
--          engine already reads for a non-override rebuild).
--
-- Scope:   4 UPDATEs, one per polymorphic entity FK on line_items
--          (order_id / inbound_request_id / self_pickup_id / service_request_id),
--          each joining that entity's `prices` row via (platform, entity_type,
--          entity_id). Lines on entities with NO prices row stay NULL — the
--          engine's defensive derive covers them at their next rebuild.
--
-- Value-preservation: for qty = 1 lines (and pass-through lines) the stamped
--          rate reproduces the stored sell EXACTLY. For qty > 1 margin lines a
--          handful of rows can differ by ±0.01 because a total-level-rounded
--          historical sell is not always representable as qty × a 2-decimal
--          per-unit rate (e.g. qty 3 × 798.61 @ 20% → 2875.00 vs 2874.99).
--          That is inherent to the ledger model, not a stamping bug; the tie-out
--          harness (db:ops:pricing-tieout) enumerates every such row and they
--          are all on terminal (CLOSED/CANCELLED/DECLINED) entities whose frozen
--          snapshots are never re-stamped. See PROGRESS.md Phase 1 log.
--
-- Safety:  Only touches rows where sell_unit_rate IS NULL AND is_voided = false
--          AND billing_mode = 'BILLABLE' AND line_item_type <> 'SYSTEM' — so it
--          is FULLY IDEMPOTENT (a second run finds every eligible row already
--          stamped and no-ops). No schema change, no enum change, no deletes.
--          NON-DESTRUCTIVE (only writes a previously-NULL column).
--
-- Apply:   `APP_ENV=staging|production bunx drizzle-kit migrate` only
--          (hand-written; no drizzle-kit generate on this repo).

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage A: ORDER lines.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "line_items" li
SET "sell_unit_rate" = CASE
        WHEN li."apply_margin" IS FALSE
             OR (li."apply_margin" IS NULL
                 AND (SELECT st."apply_margin" FROM "service_types" st
                      WHERE st."id" = li."service_type_id") IS FALSE)
            THEN li."unit_rate"
        ELSE ROUND(li."unit_rate" * (1 + p."margin_percent" / 100.0), 2)
    END
FROM "prices" p
WHERE p."entity_type" = 'ORDER'
  AND p."entity_id" = li."order_id"
  AND p."platform_id" = li."platform_id"
  AND li."order_id" IS NOT NULL
  AND li."line_item_type" <> 'SYSTEM'
  AND li."is_voided" = false
  AND li."billing_mode" = 'BILLABLE'
  AND li."sell_unit_rate" IS NULL
  AND li."unit_rate" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage B: INBOUND_REQUEST lines.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "line_items" li
SET "sell_unit_rate" = CASE
        WHEN li."apply_margin" IS FALSE
             OR (li."apply_margin" IS NULL
                 AND (SELECT st."apply_margin" FROM "service_types" st
                      WHERE st."id" = li."service_type_id") IS FALSE)
            THEN li."unit_rate"
        ELSE ROUND(li."unit_rate" * (1 + p."margin_percent" / 100.0), 2)
    END
FROM "prices" p
WHERE p."entity_type" = 'INBOUND_REQUEST'
  AND p."entity_id" = li."inbound_request_id"
  AND p."platform_id" = li."platform_id"
  AND li."inbound_request_id" IS NOT NULL
  AND li."line_item_type" <> 'SYSTEM'
  AND li."is_voided" = false
  AND li."billing_mode" = 'BILLABLE'
  AND li."sell_unit_rate" IS NULL
  AND li."unit_rate" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage C: SELF_PICKUP lines.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "line_items" li
SET "sell_unit_rate" = CASE
        WHEN li."apply_margin" IS FALSE
             OR (li."apply_margin" IS NULL
                 AND (SELECT st."apply_margin" FROM "service_types" st
                      WHERE st."id" = li."service_type_id") IS FALSE)
            THEN li."unit_rate"
        ELSE ROUND(li."unit_rate" * (1 + p."margin_percent" / 100.0), 2)
    END
FROM "prices" p
WHERE p."entity_type" = 'SELF_PICKUP'
  AND p."entity_id" = li."self_pickup_id"
  AND p."platform_id" = li."platform_id"
  AND li."self_pickup_id" IS NOT NULL
  AND li."line_item_type" <> 'SYSTEM'
  AND li."is_voided" = false
  AND li."billing_mode" = 'BILLABLE'
  AND li."sell_unit_rate" IS NULL
  AND li."unit_rate" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage D: SERVICE_REQUEST lines.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "line_items" li
SET "sell_unit_rate" = CASE
        WHEN li."apply_margin" IS FALSE
             OR (li."apply_margin" IS NULL
                 AND (SELECT st."apply_margin" FROM "service_types" st
                      WHERE st."id" = li."service_type_id") IS FALSE)
            THEN li."unit_rate"
        ELSE ROUND(li."unit_rate" * (1 + p."margin_percent" / 100.0), 2)
    END
FROM "prices" p
WHERE p."entity_type" = 'SERVICE_REQUEST'
  AND p."entity_id" = li."service_request_id"
  AND p."platform_id" = li."platform_id"
  AND li."service_request_id" IS NOT NULL
  AND li."line_item_type" <> 'SYSTEM'
  AND li."is_voided" = false
  AND li."billing_mode" = 'BILLABLE'
  AND li."sell_unit_rate" IS NULL
  AND li."unit_rate" IS NOT NULL;
