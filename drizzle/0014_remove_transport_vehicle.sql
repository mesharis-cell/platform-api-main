ALTER TABLE "service_types" DROP COLUMN IF EXISTS "transport_rate_id";--> statement-breakpoint
DROP TABLE IF EXISTS "transport_rates" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "vehicle_types" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."trip_type";
