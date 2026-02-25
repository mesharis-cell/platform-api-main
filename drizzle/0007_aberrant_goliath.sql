ALTER TABLE "inbound_request_items" RENAME COLUMN "created_asset_id" TO "asset_id";--> statement-breakpoint
ALTER TABLE "inbound_request_items" DROP CONSTRAINT "inbound_request_items_created_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_request_items" ADD CONSTRAINT "inbound_request_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;