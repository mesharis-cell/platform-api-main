ALTER TABLE "orders" RENAME COLUMN "platform" TO "platform_id";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_platform_order_id_unique";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_platform_platforms_id_fk";
--> statement-breakpoint
DROP INDEX "orders_platform_company_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_platform_company_idx" ON "orders" USING btree ("platform_id","company");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_platform_order_id_unique" UNIQUE("platform_id","order_id");