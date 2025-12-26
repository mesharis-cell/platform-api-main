ALTER TABLE "asset_bookings" RENAME COLUMN "asset" TO "asset_id";--> statement-breakpoint
ALTER TABLE "asset_bookings" RENAME COLUMN "order" TO "order_id";--> statement-breakpoint
ALTER TABLE "asset_bookings" DROP CONSTRAINT "asset_bookings_asset_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "asset_bookings" DROP CONSTRAINT "asset_bookings_order_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "asset_bookings" ADD CONSTRAINT "asset_bookings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_bookings" ADD CONSTRAINT "asset_bookings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;