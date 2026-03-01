DO $$ BEGIN
    CREATE TYPE "public"."line_item_request_status" AS ENUM('REQUESTED', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."transport_trip_leg" AS ENUM('DELIVERY', 'PICKUP', 'ACCESS', 'TRANSFER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_transport_trips" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL,
    "order_id" uuid NOT NULL,
    "leg_type" "transport_trip_leg" DEFAULT 'DELIVERY' NOT NULL,
    "truck_plate" varchar(80),
    "driver_name" varchar(120),
    "driver_contact" varchar(80),
    "truck_size" varchar(80),
    "manpower" integer,
    "tailgate_required" boolean DEFAULT false NOT NULL,
    "notes" text,
    "sequence_no" integer DEFAULT 0 NOT NULL,
    "created_by" uuid NOT NULL,
    "updated_by" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_transport_trips" ADD CONSTRAINT "order_transport_trips_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_transport_trips" ADD CONSTRAINT "order_transport_trips_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_transport_trips" ADD CONSTRAINT "order_transport_trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_transport_trips" ADD CONSTRAINT "order_transport_trips_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_transport_trips_order_idx" ON "order_transport_trips" USING btree ("order_id","leg_type","sequence_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_transport_trips_platform_idx" ON "order_transport_trips" USING btree ("platform_id","order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "line_item_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "line_item_request_id" varchar(20) NOT NULL,
    "platform_id" uuid NOT NULL,
    "company_id" uuid,
    "purpose_type" "invoice_type" NOT NULL,
    "order_id" uuid,
    "inbound_request_id" uuid,
    "service_request_id" uuid,
    "status" "line_item_request_status" DEFAULT 'REQUESTED' NOT NULL,
    "description" varchar(200) NOT NULL,
    "category" "service_category" NOT NULL,
    "quantity" numeric(10, 2) NOT NULL,
    "unit" varchar(20) NOT NULL,
    "unit_rate" numeric(10, 2) NOT NULL,
    "notes" text,
    "requested_by" uuid NOT NULL,
    "reviewed_description" varchar(200),
    "reviewed_category" "service_category",
    "reviewed_quantity" numeric(10, 2),
    "reviewed_unit" varchar(20),
    "reviewed_unit_rate" numeric(10, 2),
    "reviewed_notes" text,
    "approved_billing_mode" "billing_mode",
    "admin_note" text,
    "resolved_by" uuid,
    "resolved_at" timestamp,
    "approved_line_item_id" uuid,
    "created_service_type_id" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp NOT NULL,
    CONSTRAINT "line_item_requests_platform_request_id_unique" UNIQUE("platform_id","line_item_request_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_inbound_request_id_inbound_requests_id_fk" FOREIGN KEY ("inbound_request_id") REFERENCES "public"."inbound_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_approved_line_item_id_line_items_id_fk" FOREIGN KEY ("approved_line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "line_item_requests" ADD CONSTRAINT "line_item_requests_created_service_type_id_service_types_id_fk" FOREIGN KEY ("created_service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_item_requests_platform_status_idx" ON "line_item_requests" USING btree ("platform_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_item_requests_order_idx" ON "line_item_requests" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_item_requests_inbound_idx" ON "line_item_requests" USING btree ("inbound_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_item_requests_service_idx" ON "line_item_requests" USING btree ("service_request_id");
--> statement-breakpoint
-- Pre-alpha cleanup: remove deprecated truck metadata from pricing line-item metadata
UPDATE "line_items"
SET "metadata" = COALESCE("metadata", '{}'::jsonb)
    - 'truck_plate'
    - 'driver_name'
    - 'driver_contact'
    - 'truck_size'
    - 'tailgate_required'
    - 'manpower'
    - 'city_id'
    - 'city_name'
    - 'vehicle_type_id'
    - 'vehicle_type_name'
    - 'trip_direction'
    - 'delivery_notes'
    - 'pickup_notes'
WHERE "metadata" IS NOT NULL;
--> statement-breakpoint
-- Pre-alpha cleanup: transport service default metadata is no longer used for truck details
UPDATE "service_types"
SET "default_metadata" = '{}'::jsonb
WHERE "category" = 'TRANSPORT';
