CREATE TYPE "public"."asset_category" AS ENUM('FURNITURE', 'GLASSWARE', 'INSTALLATION', 'DECOR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."asset_condition" AS ENUM('GREEN', 'ORANGE', 'RED');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('AVAILABLE', 'BOOKED', 'OUT', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."discrepancy_reason" AS ENUM('BROKEN', 'LOST', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."financial_status" AS ENUM('PENDING_QUOTE', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'PENDING_INVOICE', 'INVOICED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'SENT', 'FAILED', 'RETRYING');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'SUBMITTED', 'PRICING_REVIEW', 'PENDING_APPROVAL', 'QUOTED', 'DECLINED', 'CONFIRMED', 'IN_PREPARATION', 'READY_FOR_DELIVERY', 'IN_TRANSIT', 'DELIVERED', 'IN_USE', 'AWAITING_RETURN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."scan_type" AS ENUM('OUTBOUND', 'INBOUND');--> statement-breakpoint
CREATE TYPE "public"."tracking_method" AS ENUM('INDIVIDUAL', 'BATCH');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'LOGISTICS', 'CLIENT');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset" uuid NOT NULL,
	"order" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"blocked_from" timestamp NOT NULL,
	"blocked_until" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_condition_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"asset" uuid NOT NULL,
	"condition" "asset_condition" NOT NULL,
	"notes" text,
	"photos" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"updated_by" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"company" uuid NOT NULL,
	"warehouse" uuid NOT NULL,
	"zone" uuid NOT NULL,
	"brand" uuid,
	"name" varchar(200) NOT NULL,
	"description" text,
	"category" "asset_category" NOT NULL,
	"images" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"tracking_method" "tracking_method" NOT NULL,
	"total_quantity" integer DEFAULT 1 NOT NULL,
	"available_quantity" integer DEFAULT 1 NOT NULL,
	"qr_code" varchar(100) NOT NULL,
	"packaging" varchar(100),
	"weight_per_unit" numeric(8, 2) NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"volume_per_unit" numeric(8, 3) NOT NULL,
	"condition" "asset_condition" DEFAULT 'GREEN' NOT NULL,
	"condition_notes" text,
	"refurb_days_estimate" integer,
	"condition_history" jsonb DEFAULT '[]'::jsonb,
	"handling_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "asset_status" DEFAULT 'AVAILABLE' NOT NULL,
	"last_scanned_at" timestamp,
	"last_scanned_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "assets_qr_code_unique" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"company" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "brands_company_name_unique" UNIQUE("company","name")
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection" uuid NOT NULL,
	"asset" uuid NOT NULL,
	"default_quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"display_order" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_unique" UNIQUE("collection","asset")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"company" uuid NOT NULL,
	"brand" uuid,
	"name" varchar(200) NOT NULL,
	"description" text,
	"images" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"category" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"domain" varchar(50) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "companies_platform_domain_unique" UNIQUE("platform","domain")
);
--> statement-breakpoint
CREATE TABLE "company_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"company" uuid NOT NULL,
	"hostname" text NOT NULL,
	"type" varchar(30) NOT NULL,
	"is_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "company_domains_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order" uuid NOT NULL,
	"notification_type" varchar(100) NOT NULL,
	"recipients" text NOT NULL,
	"status" "notification_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_attempt_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"message_id" varchar(255),
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order" uuid NOT NULL,
	"asset" uuid NOT NULL,
	"asset_name" varchar(200) NOT NULL,
	"quantity" integer NOT NULL,
	"volume_per_unit" numeric(8, 3) NOT NULL,
	"weight_per_unit" numeric(8, 2) NOT NULL,
	"total_volume" numeric(8, 3) NOT NULL,
	"total_weight" numeric(8, 2) NOT NULL,
	"condition_notes" text,
	"handling_tags" text[] DEFAULT ARRAY[]::text[],
	"from_collection" uuid,
	"from_collection_name" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"notes" text,
	"updated_by" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order_id" varchar(20) NOT NULL,
	"company" uuid NOT NULL,
	"brand" uuid,
	"user_id" uuid NOT NULL,
	"job_number" varchar(50),
	"contact_name" varchar(100) NOT NULL,
	"contact_email" varchar(255) NOT NULL,
	"contact_phone" varchar(50) NOT NULL,
	"event_start_date" timestamp NOT NULL,
	"event_end_date" timestamp NOT NULL,
	"venue_name" varchar(200) NOT NULL,
	"venue_location" jsonb NOT NULL,
	"special_instructions" text,
	"delivery_window" jsonb,
	"pickup_window" jsonb,
	"calculated_totals" jsonb NOT NULL,
	"tier" uuid,
	"logistics_pricing" jsonb,
	"platform_pricing" jsonb,
	"final_pricing" jsonb,
	"invoice_id" varchar(30),
	"invoice_generated_at" timestamp,
	"invoice_paid_at" timestamp,
	"payment_method" varchar(50),
	"payment_reference" varchar(100),
	"order_status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"financial_status" "financial_status" DEFAULT 'PENDING_QUOTE' NOT NULL,
	"order_status_history" jsonb DEFAULT '[]',
	"financial_status_history" jsonb DEFAULT '[]',
	"scanning_data" jsonb DEFAULT '{}',
	"delivery_photos" text[] DEFAULT ARRAY[]::text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "orders_platform_order_id_unique" UNIQUE("platform","order_id"),
	CONSTRAINT "orders_platform_invoice_id_unique" UNIQUE("platform","invoice_id")
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"domain" varchar(100) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "platforms_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "pricing_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"country" varchar(50) NOT NULL,
	"city" varchar(50) NOT NULL,
	"volume_min" numeric(8, 3) NOT NULL,
	"volume_max" numeric(8, 3),
	"base_price" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "pricing_tiers_unique" UNIQUE("platform","country","city","volume_min","volume_max")
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order" uuid NOT NULL,
	"asset" uuid NOT NULL,
	"scan_type" "scan_type" NOT NULL,
	"quantity" integer NOT NULL,
	"condition" "asset_condition" NOT NULL,
	"notes" text,
	"photos" text[] DEFAULT ARRAY[]::text[],
	"discrepancy_reason" "discrepancy_reason",
	"scanned_by" text NOT NULL,
	"scanned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"company" uuid,
	"name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'CLIENT' NOT NULL,
	"permissions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"permission_template" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"country" varchar(50) NOT NULL,
	"city" varchar(50) NOT NULL,
	"address" text NOT NULL,
	"coordinates" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "warehouses_platform_name_unique" UNIQUE("platform","name")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"warehouse" uuid NOT NULL,
	"company" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"capacity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "zones_warehouse_company_name_unique" UNIQUE("warehouse","company","name")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_bookings" ADD CONSTRAINT "asset_bookings_asset_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_bookings" ADD CONSTRAINT "asset_bookings_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_condition_history" ADD CONSTRAINT "asset_condition_history_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_condition_history" ADD CONSTRAINT "asset_condition_history_asset_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_condition_history" ADD CONSTRAINT "asset_condition_history_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_warehouse_warehouses_id_fk" FOREIGN KEY ("warehouse") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_zone_zones_id_fk" FOREIGN KEY ("zone") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_brand_brands_id_fk" FOREIGN KEY ("brand") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_last_scanned_by_users_id_fk" FOREIGN KEY ("last_scanned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_collections_id_fk" FOREIGN KEY ("collection") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_asset_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_brand_brands_id_fk" FOREIGN KEY ("brand") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_domains" ADD CONSTRAINT "company_domains_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_domains" ADD CONSTRAINT "company_domains_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_asset_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_from_collection_collections_id_fk" FOREIGN KEY ("from_collection") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_brand_brands_id_fk" FOREIGN KEY ("brand") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tier_pricing_tiers_id_fk" FOREIGN KEY ("tier") REFERENCES "public"."pricing_tiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ADD CONSTRAINT "pricing_tiers_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_asset_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_warehouse_warehouses_id_fk" FOREIGN KEY ("warehouse") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_company_companies_id_fk" FOREIGN KEY ("company") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_bookings_dates_idx" ON "asset_bookings" USING btree ("blocked_from","blocked_until");--> statement-breakpoint
CREATE INDEX "asset_condition_history_asset_idx" ON "asset_condition_history" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "asset_condition_history_platform_idx" ON "asset_condition_history" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "assets_platform_idx" ON "assets" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "assets_company_idx" ON "assets" USING btree ("company");--> statement-breakpoint
CREATE INDEX "assets_qr_code_idx" ON "assets" USING btree ("qr_code");--> statement-breakpoint
CREATE INDEX "collections_company_idx" ON "collections" USING btree ("company");--> statement-breakpoint
CREATE INDEX "companies_platform_idx" ON "companies" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "company_domains_hostname_idx" ON "company_domains" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "notification_logs_order_idx" ON "notification_logs" USING btree ("order");--> statement-breakpoint
CREATE INDEX "notification_logs_status_idx" ON "notification_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order");--> statement-breakpoint
CREATE INDEX "order_items_asset_idx" ON "order_items" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "order_items_platform_idx" ON "order_items" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "order_items_from_collection_idx" ON "order_items" USING btree ("from_collection");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order");--> statement-breakpoint
CREATE INDEX "orders_platform_company_idx" ON "orders" USING btree ("platform","company");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("order_status");--> statement-breakpoint
CREATE INDEX "orders_financial_status_idx" ON "orders" USING btree ("financial_status");--> statement-breakpoint
CREATE INDEX "orders_event_date_idx" ON "orders" USING btree ("event_start_date");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platforms_domain_idx" ON "platforms" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "pricing_tiers_platform_location_idx" ON "pricing_tiers" USING btree ("platform","country","city");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_platform_idx" ON "users" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "user_company_idx" ON "users" USING btree ("company");--> statement-breakpoint
CREATE UNIQUE INDEX "user_platform_email_unique" ON "users" USING btree ("platform","email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");