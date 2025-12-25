ALTER TABLE "assets" RENAME COLUMN "platform" TO "platform_id";--> statement-breakpoint
ALTER TABLE "assets" RENAME COLUMN "company" TO "company_id";--> statement-breakpoint
ALTER TABLE "assets" RENAME COLUMN "warehouse" TO "warehouse_id";--> statement-breakpoint
ALTER TABLE "assets" RENAME COLUMN "zone" TO "zone_id";--> statement-breakpoint
ALTER TABLE "assets" RENAME COLUMN "brand" TO "brand_id";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_platform_platforms_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_company_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_warehouse_warehouses_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_zone_zones_id_fk";
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_brand_brands_id_fk";
--> statement-breakpoint
DROP INDEX "assets_platform_idx";--> statement-breakpoint
DROP INDEX "assets_company_idx";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_platform_idx" ON "assets" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "assets_company_idx" ON "assets" USING btree ("company_id");