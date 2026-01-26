ALTER TYPE "public"."financial_status" ADD VALUE 'QUOTE_REVISED' BEFORE 'QUOTE_ACCEPTED';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'RETURN_IN_TRANSIT' BEFORE 'CLOSED';--> statement-breakpoint
ALTER TABLE "pricing_tiers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "pricing_tiers" CASCADE;--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_tier_pricing_tiers_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "truck_photos" text[] DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "tier";