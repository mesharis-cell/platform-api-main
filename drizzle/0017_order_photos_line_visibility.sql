ALTER TABLE "orders" ADD COLUMN "return_truck_photos" text[] DEFAULT ARRAY[]::text[];
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "on_site_photos" text[] DEFAULT ARRAY[]::text[];
--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "client_price_visible" boolean NOT NULL DEFAULT false;
