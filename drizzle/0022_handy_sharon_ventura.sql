ALTER TABLE "order_prices" ALTER COLUMN "logistics_sub_total" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_prices" ALTER COLUMN "final_total" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_prices" ADD COLUMN "base_ops_total" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "venue_city_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_venue_city_id_cities_id_fk" FOREIGN KEY ("venue_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;