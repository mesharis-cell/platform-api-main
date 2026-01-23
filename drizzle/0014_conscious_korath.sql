CREATE TYPE "public"."line_item_type" AS ENUM('CATALOG', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('ASSEMBLY', 'EQUIPMENT', 'HANDLING', 'RESKIN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."trip_type" AS ENUM('ONE_WAY', 'ROUND_TRIP');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('STANDARD', '7_TON', '10_TON');--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'TRANSFORMED';--> statement-breakpoint
ALTER TYPE "public"."financial_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'AWAITING_FABRICATION' BEFORE 'IN_PREPARATION';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
CREATE TABLE "order_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order" uuid NOT NULL,
	"service_type" uuid,
	"reskin_request" uuid,
	"line_item_type" "line_item_type" NOT NULL,
	"category" "service_category" NOT NULL,
	"description" varchar(200) NOT NULL,
	"quantity" numeric(10, 2),
	"unit" varchar(20),
	"unit_rate" numeric(10, 2),
	"total" numeric(10, 2) NOT NULL,
	"added_by" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"is_voided" boolean DEFAULT false NOT NULL,
	"voided_at" timestamp,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"company" uuid,
	"warehouse_ops_rate" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "pricing_config_platform_company_unique" UNIQUE("platform","company")
);
--> statement-breakpoint
CREATE TABLE "reskin_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order" uuid NOT NULL,
	"order_item" uuid NOT NULL,
	"original_asset" uuid NOT NULL,
	"original_asset_name" varchar(200) NOT NULL,
	"target_brand" uuid,
	"target_brand_custom" varchar(100),
	"client_notes" text NOT NULL,
	"admin_notes" text,
	"new_asset" uuid,
	"new_asset_name" varchar(200),
	"completed_at" timestamp,
	"completed_by" uuid,
	"completion_notes" text,
	"completion_photos" text[] DEFAULT ARRAY[]::text[],
	"cancelled_at" timestamp,
	"cancelled_by" uuid,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" "service_category" NOT NULL,
	"unit" varchar(20) NOT NULL,
	"default_rate" numeric(10, 2),
	"description" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "service_types_platform_name_unique" UNIQUE("platform","name")
);
--> statement-breakpoint
CREATE TABLE "transport_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"company" uuid,
	"emirate" varchar(50) NOT NULL,
	"area" varchar(100),
	"trip_type" "trip_type" NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"rate" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "transport_rates_unique" UNIQUE("platform","company","emirate","area","trip_type","vehicle_type")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "transformed_from" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "transformed_to" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "is_reskin_request" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "reskin_target_brand" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "reskin_target_brand_custom" varchar(100);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "reskin_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transport_trip_type" "trip_type" DEFAULT 'ROUND_TRIP' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transport_vehicle_type" "vehicle_type" DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "pricing" jsonb;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_service_type_service_types_id_fk" FOREIGN KEY ("service_type") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_reskin_request_reskin_requests_id_fk" FOREIGN KEY ("reskin_request") REFERENCES "public"."reskin_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_order_item_order_items_id_fk" FOREIGN KEY ("order_item") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_original_asset_assets_id_fk" FOREIGN KEY ("original_asset") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_target_brand_brands_id_fk" FOREIGN KEY ("target_brand") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_new_asset_assets_id_fk" FOREIGN KEY ("new_asset") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reskin_requests" ADD CONSTRAINT "reskin_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_rates" ADD CONSTRAINT "transport_rates_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_rates" ADD CONSTRAINT "transport_rates_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_line_items_order_idx" ON "order_line_items" USING btree ("order");--> statement-breakpoint
CREATE INDEX "order_line_items_reskin_idx" ON "order_line_items" USING btree ("reskin_request");--> statement-breakpoint
CREATE INDEX "order_line_items_active_idx" ON "order_line_items" USING btree ("order","is_voided");--> statement-breakpoint
CREATE INDEX "pricing_config_platform_company_idx" ON "pricing_config" USING btree ("platform","company");--> statement-breakpoint
CREATE INDEX "reskin_requests_order_idx" ON "reskin_requests" USING btree ("order");--> statement-breakpoint
CREATE INDEX "reskin_requests_order_item_idx" ON "reskin_requests" USING btree ("order_item");--> statement-breakpoint
CREATE INDEX "reskin_requests_pending_idx" ON "reskin_requests" USING btree ("order") WHERE "reskin_requests"."completed_at" IS NULL AND "reskin_requests"."cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "service_types_platform_active_idx" ON "service_types" USING btree ("platform","is_active","display_order");--> statement-breakpoint
CREATE INDEX "transport_rates_lookup_idx" ON "transport_rates" USING btree ("platform","emirate","trip_type","vehicle_type");--> statement-breakpoint
CREATE INDEX "transport_rates_company_idx" ON "transport_rates" USING btree ("company");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_transformed_from_assets_id_fk" FOREIGN KEY ("transformed_from") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_transformed_to_assets_id_fk" FOREIGN KEY ("transformed_to") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_reskin_target_brand_brands_id_fk" FOREIGN KEY ("reskin_target_brand") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;