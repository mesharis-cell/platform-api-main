ALTER TABLE "order_prices" DROP CONSTRAINT "order_prices_platform_order_unique";--> statement-breakpoint
ALTER TABLE "order_prices" DROP CONSTRAINT "order_prices_order_id_orders_id_fk";
--> statement-breakpoint
DROP INDEX "order_prices_order_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_pricing_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_pricing_id_order_prices_id_fk" FOREIGN KEY ("order_pricing_id") REFERENCES "public"."order_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_prices" DROP COLUMN "order_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "logistics_pricing";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "platform_pricing";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "final_pricing";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "pricing";