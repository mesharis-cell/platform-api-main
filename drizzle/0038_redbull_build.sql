-- Red Bull build: self-pickups, stock movements, venue contact split, pooled settlement.
-- See plan: /home/mshari696/.claude/plans/tender-knitting-avalanche.md
--
-- Safety properties:
--   - Fully additive: no DROP, no NOT NULL tightening, no column renames.
--   - Idempotent: every CREATE/ADD uses IF NOT EXISTS or a DO $$ ... $$ wrapper.
--   - Does NOT use any new enum value as a literal in this file (per PG transaction rules).
--   - Existing asset_bookings and scan_events rows all satisfy the new CHECK constraints
--     because every current row has order_id / order set and self_pickup_id is a newly
--     added nullable column.

-- ============================================================================
-- 1. ENUM VALUE ADDITIONS
-- ============================================================================

ALTER TYPE "public"."invoice_type" ADD VALUE IF NOT EXISTS 'SELF_PICKUP';
--> statement-breakpoint
ALTER TYPE "public"."workflow_request_entity_type" ADD VALUE IF NOT EXISTS 'SELF_PICKUP';
--> statement-breakpoint
ALTER TYPE "public"."attachment_entity_type" ADD VALUE IF NOT EXISTS 'SELF_PICKUP';
--> statement-breakpoint
-- entity_type enum is used by system_events for audit/event bus logging
ALTER TYPE "public"."entity_type" ADD VALUE IF NOT EXISTS 'SELF_PICKUP';
--> statement-breakpoint

-- ============================================================================
-- 2. NEW ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "public"."self_pickup_status" AS ENUM (
        'SUBMITTED',
        'PRICING_REVIEW',
        'PENDING_APPROVAL',
        'QUOTED',
        'DECLINED',
        'CONFIRMED',
        'READY_FOR_PICKUP',
        'PICKED_UP',
        'IN_USE',
        'AWAITING_RETURN',
        'RETURNED',
        'CLOSED',
        'CANCELLED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "public"."stock_movement_type" AS ENUM (
        'OUTBOUND',
        'INBOUND',
        'WRITE_OFF',
        'ADJUSTMENT',
        'INITIAL'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    CREATE TYPE "public"."stock_write_off_reason" AS ENUM (
        'CONSUMED',
        'LOST',
        'DAMAGED',
        'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================================
-- 3. COLUMN ADDITIONS ON EXISTING TABLES
-- ============================================================================

-- asset_families: low-stock threshold (family-level, nullable = no threshold)
ALTER TABLE "asset_families"
    ADD COLUMN IF NOT EXISTS "low_stock_threshold" integer;
--> statement-breakpoint

-- orders: execution contact stays in contact_*; venue contact gets its own top-level columns
--         and stops being trapped inside permit_requirements JSONB.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "venue_contact_name" varchar(100);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "venue_contact_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "venue_contact_phone" varchar(50);
--> statement-breakpoint

-- orders: client-requested delivery window (immutable after submit).
-- delivery_window remains the logistics-authoritative window.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "requested_delivery_window" jsonb;
--> statement-breakpoint

-- order_items: pooled settlement tracking (see scanning pooled-aware completion).
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "settled_at" timestamp;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "settled_by" uuid;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "order_items"
        ADD CONSTRAINT "order_items_settled_by_users_id_fk"
        FOREIGN KEY ("settled_by")
        REFERENCES "public"."users"("id")
        ON DELETE no action
        ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- line_items / line_item_requests / invoices: add self_pickup_id FK so the new entity
-- type participates in the polymorphic-per-column pattern alongside order_id /
-- inbound_request_id / service_request_id.
ALTER TABLE "line_items" ADD COLUMN IF NOT EXISTS "self_pickup_id" uuid;
--> statement-breakpoint
ALTER TABLE "line_item_requests" ADD COLUMN IF NOT EXISTS "self_pickup_id" uuid;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "self_pickup_id" uuid;
--> statement-breakpoint

-- ============================================================================
-- 4. NEW TABLE: self_pickups
-- ============================================================================

CREATE TABLE IF NOT EXISTS "self_pickups" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL,
    "self_pickup_id" varchar(20) NOT NULL,
    "company_id" uuid NOT NULL,
    "brand_id" uuid,
    "created_by" uuid NOT NULL,
    "job_number" varchar(50),
    "po_number" varchar(100),
    "collector_name" varchar(100) NOT NULL,
    "collector_phone" varchar(50) NOT NULL,
    "collector_email" varchar(255),
    "pickup_window" jsonb NOT NULL,
    "expected_return_at" timestamp,
    "notes" text,
    "special_instructions" text,
    "self_pickup_pricing_id" uuid NOT NULL,
    "calculated_totals" jsonb NOT NULL,
    "self_pickup_status" "self_pickup_status" DEFAULT 'SUBMITTED' NOT NULL,
    "financial_status" "financial_status" DEFAULT 'PENDING_QUOTE' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "deleted_at" timestamp
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickups"
        ADD CONSTRAINT "self_pickups_platform_id_platforms_id_fk"
        FOREIGN KEY ("platform_id")
        REFERENCES "public"."platforms"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickups"
        ADD CONSTRAINT "self_pickups_company_id_companies_id_fk"
        FOREIGN KEY ("company_id")
        REFERENCES "public"."companies"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickups"
        ADD CONSTRAINT "self_pickups_brand_id_brands_id_fk"
        FOREIGN KEY ("brand_id")
        REFERENCES "public"."brands"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickups"
        ADD CONSTRAINT "self_pickups_created_by_users_id_fk"
        FOREIGN KEY ("created_by")
        REFERENCES "public"."users"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickups"
        ADD CONSTRAINT "self_pickups_self_pickup_pricing_id_prices_id_fk"
        FOREIGN KEY ("self_pickup_pricing_id")
        REFERENCES "public"."prices"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "self_pickups_platform_self_pickup_id_unique"
    ON "self_pickups" USING btree ("platform_id", "self_pickup_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_pickups_platform_company_idx"
    ON "self_pickups" USING btree ("platform_id", "company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_pickups_status_idx"
    ON "self_pickups" USING btree ("self_pickup_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_pickups_financial_status_idx"
    ON "self_pickups" USING btree ("financial_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_pickups_created_at_idx"
    ON "self_pickups" USING btree ("created_at");
--> statement-breakpoint

-- FK constraints for line_items / line_item_requests / invoices self_pickup_id
-- (columns were added earlier, but FKs must come after self_pickups table exists)
DO $$ BEGIN
    ALTER TABLE "line_items"
        ADD CONSTRAINT "line_items_self_pickup_id_self_pickups_id_fk"
        FOREIGN KEY ("self_pickup_id") REFERENCES "public"."self_pickups"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "line_item_requests"
        ADD CONSTRAINT "line_item_requests_self_pickup_id_self_pickups_id_fk"
        FOREIGN KEY ("self_pickup_id") REFERENCES "public"."self_pickups"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "invoices"
        ADD CONSTRAINT "invoices_self_pickup_id_self_pickups_id_fk"
        FOREIGN KEY ("self_pickup_id") REFERENCES "public"."self_pickups"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================================
-- 5. NEW TABLE: self_pickup_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS "self_pickup_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL,
    "self_pickup_id" uuid NOT NULL,
    "asset_id" uuid NOT NULL,
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
    "settled_at" timestamp,
    "settled_by" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_items"
        ADD CONSTRAINT "self_pickup_items_platform_id_platforms_id_fk"
        FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_items"
        ADD CONSTRAINT "self_pickup_items_self_pickup_id_self_pickups_id_fk"
        FOREIGN KEY ("self_pickup_id") REFERENCES "public"."self_pickups"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_items"
        ADD CONSTRAINT "self_pickup_items_asset_id_assets_id_fk"
        FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_items"
        ADD CONSTRAINT "self_pickup_items_from_collection_collections_id_fk"
        FOREIGN KEY ("from_collection") REFERENCES "public"."collections"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_items"
        ADD CONSTRAINT "self_pickup_items_settled_by_users_id_fk"
        FOREIGN KEY ("settled_by") REFERENCES "public"."users"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "self_pickup_items_pickup_idx"
    ON "self_pickup_items" USING btree ("self_pickup_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_pickup_items_asset_idx"
    ON "self_pickup_items" USING btree ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "self_pickup_items_platform_idx"
    ON "self_pickup_items" USING btree ("platform_id");
--> statement-breakpoint

-- ============================================================================
-- 6. NEW TABLE: self_pickup_status_history
-- ============================================================================

CREATE TABLE IF NOT EXISTS "self_pickup_status_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL,
    "self_pickup_id" uuid NOT NULL,
    "status" "self_pickup_status" NOT NULL,
    "notes" text,
    "updated_by" uuid NOT NULL,
    "timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_status_history"
        ADD CONSTRAINT "self_pickup_status_history_platform_id_platforms_id_fk"
        FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_status_history"
        ADD CONSTRAINT "self_pickup_status_history_self_pickup_id_self_pickups_id_fk"
        FOREIGN KEY ("self_pickup_id") REFERENCES "public"."self_pickups"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "self_pickup_status_history"
        ADD CONSTRAINT "self_pickup_status_history_updated_by_users_id_fk"
        FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "self_pickup_status_history_pickup_idx"
    ON "self_pickup_status_history" USING btree ("self_pickup_id");
--> statement-breakpoint

-- ============================================================================
-- 7. POLYMORPHIC ASSET_BOOKINGS
-- Existing rows: all have order_id set, self_pickup_id will be null -> CHECK passes.
-- ============================================================================

ALTER TABLE "asset_bookings" ALTER COLUMN "order_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "asset_bookings" ADD COLUMN IF NOT EXISTS "self_pickup_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "asset_bookings"
        ADD CONSTRAINT "asset_bookings_self_pickup_id_self_pickups_id_fk"
        FOREIGN KEY ("self_pickup_id") REFERENCES "public"."self_pickups"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "asset_bookings"
        ADD CONSTRAINT "asset_bookings_parent_check"
        CHECK (
            ("order_id" IS NOT NULL AND "self_pickup_id" IS NULL)
            OR ("order_id" IS NULL AND "self_pickup_id" IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "asset_bookings_self_pickup_idx"
    ON "asset_bookings" USING btree ("self_pickup_id");
--> statement-breakpoint

-- ============================================================================
-- 8. POLYMORPHIC SCAN_EVENTS
-- Note: PG column name is "order" (TS field: order_id). Same for "asset" / asset_id.
-- Existing rows: all have "order" set -> CHECK passes.
-- Application-level rule: DERIG_CAPTURE / OUTBOUND_TRUCK_PHOTOS / RETURN_TRUCK_PHOTOS
-- / ON_SITE_CAPTURE scan_types are restricted to order_id only (enforced in service
-- layer, not a DB CHECK).
-- ============================================================================

ALTER TABLE "scan_events" ALTER COLUMN "order" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "scan_events" ADD COLUMN IF NOT EXISTS "self_pickup_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "scan_events"
        ADD CONSTRAINT "scan_events_self_pickup_id_self_pickups_id_fk"
        FOREIGN KEY ("self_pickup_id") REFERENCES "public"."self_pickups"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "scan_events"
        ADD CONSTRAINT "scan_events_parent_check"
        CHECK (
            ("order" IS NOT NULL AND "self_pickup_id" IS NULL)
            OR ("order" IS NULL AND "self_pickup_id" IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================================
-- 9. NEW TABLE: stock_movements
-- ============================================================================

CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL,
    "asset_id" uuid,
    "asset_family_id" uuid,
    "delta" integer NOT NULL,
    "movement_type" "stock_movement_type" NOT NULL,
    "write_off_reason" "stock_write_off_reason",
    "note" text,
    "linked_entity_type" varchar(20),
    "linked_entity_id" uuid,
    "linked_scan_event_id" uuid,
    "created_by" uuid NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "stock_movements"
        ADD CONSTRAINT "stock_movements_platform_id_platforms_id_fk"
        FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id")
        ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "stock_movements"
        ADD CONSTRAINT "stock_movements_asset_id_assets_id_fk"
        FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "stock_movements"
        ADD CONSTRAINT "stock_movements_asset_family_id_asset_families_id_fk"
        FOREIGN KEY ("asset_family_id") REFERENCES "public"."asset_families"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "stock_movements"
        ADD CONSTRAINT "stock_movements_linked_scan_event_id_scan_events_id_fk"
        FOREIGN KEY ("linked_scan_event_id") REFERENCES "public"."scan_events"("id")
        ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
    ALTER TABLE "stock_movements"
        ADD CONSTRAINT "stock_movements_created_by_users_id_fk"
        FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
        ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "stock_movements_asset_idx"
    ON "stock_movements" USING btree ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_family_idx"
    ON "stock_movements" USING btree ("asset_family_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_linked_entity_idx"
    ON "stock_movements" USING btree ("linked_entity_type", "linked_entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_platform_idx"
    ON "stock_movements" USING btree ("platform_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_created_at_idx"
    ON "stock_movements" USING btree ("created_at");
