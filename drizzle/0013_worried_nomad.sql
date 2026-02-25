CREATE TYPE "public"."maintenance_decision" AS ENUM('FIX_IN_ORDER', 'USE_AS_IS');--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "maintenance_decision" "maintenance_decision";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "requires_maintenance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "maintenance_refurb_days_snapshot" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "maintenance_decision_locked_at" timestamp;