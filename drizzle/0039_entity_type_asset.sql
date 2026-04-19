-- Add ASSET to entity_type enum.
-- Used by system_events (audit/event bus logging) for stock alerts and other
-- asset-scoped events where the "entity" is an asset, not an order/pickup/etc.
--
-- Safety: additive enum value, PG 12+ supports ADD VALUE inside transactions
-- as long as the new value isn't used as a literal in the same migration.
-- This migration does not use 'ASSET' as a literal.

ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'ASSET';
