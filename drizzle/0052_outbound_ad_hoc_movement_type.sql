-- Migration 0052 — additive schema for OUTBOUND_AD_HOC movement type.
--
-- Pure additive: a new enum value, a new reason enum, and a nullable column.
-- No data writes; no UPDATEs that USE the new enum value (PG won't let you
-- USE an enum value in the same tx that ADDED it). The data backfill +
-- constraint on assets land in migration 0053, which runs in a fresh tx and
-- can therefore reference 'OUTBOUND_AD_HOC'.
--
-- WHY a new movement type:
-- WRITE_OFF was being used by operators in the manual adjustment dialog for
-- two distinct purposes: (a) settlement against a live booking that didn't
-- fully return, and (b) ad-hoc consumption — operator walks into the
-- warehouse and grabs a unit for replacement, install, etc., outside any
-- booking lifecycle. The math for these two cases differs: settlement
-- decrements `total_quantity` only (the booking already accounted for
-- available); ad-hoc must decrement BOTH because the unit was sitting
-- freely in `available`. Conflating them produced the prod drift where
-- 3 assets ended up with available > total.
--
-- OUTBOUND_AD_HOC captures case (b) explicitly. WRITE_OFF stays for case (a)
-- (settlement, fired automatically by the inbound-scan flow). The manual
-- dialog no longer fires WRITE_OFF at all post-PR-6.
--
-- WHY a new reason enum:
-- The existing stock_write_off_reason values (CONSUMED / LOST / DAMAGED /
-- OTHER) describe failure modes for settlement. They don't fit ad-hoc
-- consumption ("Replacement for Faris pickup", "Install consumption for
-- ORD-X", "Repurposed internally"). New enum gives correct vocabulary.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'stock_movement_type' AND e.enumlabel = 'OUTBOUND_AD_HOC'
    ) THEN
        ALTER TYPE "stock_movement_type" ADD VALUE 'OUTBOUND_AD_HOC';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbound_ad_hoc_reason') THEN
        CREATE TYPE "outbound_ad_hoc_reason" AS ENUM (
            'REPLACEMENT',
            'INSTALL_CONSUMPTION',
            'REPURPOSED',
            'OTHER'
        );
    END IF;
END $$;

ALTER TABLE "stock_movements"
    ADD COLUMN IF NOT EXISTS "outbound_ad_hoc_reason" "outbound_ad_hoc_reason";
